'use strict';

const { Result } = require('@repair/shared-kernel/Result');
const { Permission } = require('@repair/domain/access/Permission');
const { authorize } = require('../access/authorize');
const { appendOrderAudit } = require('../shared/audit');
const { appendWorkOrderMessage } = require('../shared/workOrder');

const LARGE_REFUND_CENTS = 20000; // 200.00 元

/**
 * ApproveRefundUseCase —— 客服／管理員批准退款（P5）。
 *
 * - ≤200 元：`refunds.approve_small`（客服可單人審批）
 * - >200 元：`refunds.approve_large`（SoD：發起者不得自批）
 * - 呼叫 MockPaymentGateway.refund
 * - 客服批准後累加當日退款額度
 */
class ApproveRefundUseCase {
  constructor({
    orderRepository,
    refundRepository,
    csAgentRepository,
    paymentGateway,
    workOrderRepository,
    workOrderMessageRepository,
    auditLogRepository,
    clock,
  }) {
    if (!orderRepository) throw new TypeError('ApproveRefundUseCase 需要 orderRepository');
    if (!refundRepository) throw new TypeError('ApproveRefundUseCase 需要 refundRepository');
    if (!paymentGateway) throw new TypeError('ApproveRefundUseCase 需要 paymentGateway');
    if (!clock) throw new TypeError('ApproveRefundUseCase 需要 clock');

    this.orderRepository = orderRepository;
    this.refundRepository = refundRepository;
    this.csAgentRepository = csAgentRepository || null;
    this.paymentGateway = paymentGateway;
    this.workOrderRepository = workOrderRepository || null;
    this.workOrderMessageRepository = workOrderMessageRepository || null;
    this.auditLogRepository = auditLogRepository || null;
    this.clock = clock;
  }

  async execute({ actor, refundId } = {}) {
    const refund = await this.refundRepository.findById(refundId);
    if (!refund) return Result.notFound(`退款不存在：${refundId}`);
    if (refund.status !== 'requested') {
      return Result.preconditionFailed(`退款狀態不可批准：${refund.status}`, { refundId });
    }

    const order = await this.orderRepository.findById(refund.orderId);
    if (!order) return Result.notFound(`訂單不存在：${refund.orderId}`);

    const refundedCents = (await this.refundRepository.listByOrderId(order.id))
      .filter((entry) => entry.refundId !== refundId && ['approved', 'refunded', 'processed'].includes(entry.status))
      .reduce((sum, entry) => sum + entry.amountCents, 0);

    const permission =
      refund.amountCents > LARGE_REFUND_CENTS
        ? Permission.REFUND_APPROVE_LARGE.key
        : Permission.REFUND_APPROVE_SMALL.key;

    const denied = authorize(actor, permission, {
      order: {
        paidCents: order.amounts.total.cents,
        refundedCents,
        customerId: order.customerId,
      },
      refund: { requestedBy: refund.requestedBy },
      requestedRefundCents: refund.amountCents,
    });
    if (denied) return denied;

    const now = this.clock.now();
    const gatewayResult = await this.paymentGateway.refund({
      orderId: order.id,
      orderNo: order.orderNo.value,
      outRefundNo: refund.outRefundNo,
      amountCents: refund.amountCents,
      reason: refund.reason,
    });
    if (!gatewayResult || gatewayResult.ok === false) {
      return Result.upstreamFailed('退款失敗', {
        code: gatewayResult ? gatewayResult.code : 'NO_RESPONSE',
      });
    }

    const updated = { ...refund, status: 'refunded', processedAt: now };
    await this.refundRepository.save(updated);

    if (this.csAgentRepository && actor.role === 'cs_agent') {
      await this.csAgentRepository.incrementDailyRefundUsage({
        csAgentId: actor.csAgentId || actor.id,
        date: dateKey(now),
        amountCents: refund.amountCents,
      });
    }

    await appendOrderAudit({
      auditLogRepository: this.auditLogRepository,
      orderId: order.id,
      actor,
      action: 'refund.approve',
      at: now,
      reasonCode: 'REFUND_APPROVED',
      details: { refundId, amountCents: refund.amountCents, permission },
    });
    await appendWorkOrderMessage({
      workOrderRepository: this.workOrderRepository,
      workOrderMessageRepository: this.workOrderMessageRepository,
      orderId: order.id,
      actor,
      body: `退款已批准 ${(refund.amountCents / 100).toFixed(2)} 元`,
      at: now,
      messageId: `msg-${order.id}-refund-approve-${refundId}`,
    });

    return Result.ok({
      refundId,
      orderId: order.id,
      status: updated.status,
      amountCents: refund.amountCents,
      processedAt: now,
    });
  }
}

function dateKey(now) {
  const shifted = new Date(now + 480 * 60_000);
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, '0')}-${String(
    shifted.getUTCDate(),
  ).padStart(2, '0')}`;
}

module.exports = { ApproveRefundUseCase, LARGE_REFUND_CENTS };
