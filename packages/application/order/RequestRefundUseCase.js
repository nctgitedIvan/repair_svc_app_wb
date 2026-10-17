'use strict';

const { Result } = require('@repair/shared-kernel/Result');
const { Permission } = require('@repair/domain/access/Permission');
const { authorize } = require('../access/authorize');
const { appendOrderAudit } = require('../shared/audit');
const { appendWorkOrderMessage } = require('../shared/workOrder');

/**
 * RequestRefundUseCase —— 客戶／客服發起退款（P5）。
 *
 * 只建立 `refund_records(requested)`；實際退款在 ApproveRefund。
 * `requestedBy` 會被寫入，供 `SoDConstraint` 判斷「發起者不得自批」。
 */
class RequestRefundUseCase {
  constructor({
    orderRepository,
    refundRepository,
    workOrderRepository,
    workOrderMessageRepository,
    auditLogRepository,
    idGenerator,
    clock,
  }) {
    if (!orderRepository) throw new TypeError('RequestRefundUseCase 需要 orderRepository');
    if (!refundRepository) throw new TypeError('RequestRefundUseCase 需要 refundRepository');
    if (!idGenerator) throw new TypeError('RequestRefundUseCase 需要 idGenerator');
    if (!clock) throw new TypeError('RequestRefundUseCase 需要 clock');

    this.orderRepository = orderRepository;
    this.refundRepository = refundRepository;
    this.workOrderRepository = workOrderRepository || null;
    this.workOrderMessageRepository = workOrderMessageRepository || null;
    this.auditLogRepository = auditLogRepository || null;
    this.idGenerator = idGenerator;
    this.clock = clock;
  }

  async execute({ actor, orderId, amountCents, reason } = {}) {
    const order = await this.orderRepository.findById(orderId);
    if (!order) return Result.notFound(`訂單不存在：${orderId}`);

    const denied = authorize(actor, Permission.REFUND_REQUEST.key, { order });
    if (denied) return denied;

    if (!Number.isInteger(amountCents) || amountCents <= 0) {
      return Result.validation('退款金額必須是正整數', { amountCents });
    }

    const existing = await this.refundRepository.listByOrderId(orderId);
    const requestedTotal = existing
      .filter((refund) => refund.status !== 'failed')
      .reduce((sum, refund) => sum + refund.amountCents, 0);
    if (requestedTotal + amountCents > order.amounts.total.cents) {
      return Result.preconditionFailed('退款金額超過訂單總額', {
        requested: amountCents,
        alreadyRequested: requestedTotal,
        totalCents: order.amounts.total.cents,
      });
    }

    const now = this.clock.now();
    const outRefundNo = this.idGenerator.nextOutRefundNo(order.orderNo.value, existing.length + 1);
    const refund = {
      refundId: `refund-${outRefundNo}`,
      orderId,
      outRefundNo,
      amountCents,
      currency: order.amounts.total.currency,
      status: 'requested',
      reason: reason || null,
      requestedBy: actor.id,
      requestedAt: now,
      processedAt: null,
      createdAt: now,
    };
    await this.refundRepository.save(refund);

    await appendOrderAudit({
      auditLogRepository: this.auditLogRepository,
      orderId,
      actor,
      action: 'refund.request',
      at: now,
      reasonCode: 'REFUND_REQUEST',
      details: { refundId: refund.refundId, amountCents },
    });
    await appendWorkOrderMessage({
      workOrderRepository: this.workOrderRepository,
      workOrderMessageRepository: this.workOrderMessageRepository,
      orderId,
      actor,
      body: `申請退款 ${(amountCents / 100).toFixed(2)} 元`,
      at: now,
      messageId: `msg-${orderId}-refund-request-${refund.refundId}`,
    });

    return Result.ok({
      refundId: refund.refundId,
      orderId,
      outRefundNo,
      amountCents,
      status: refund.status,
      requestedBy: refund.requestedBy,
    });
  }
}

module.exports = { RequestRefundUseCase };
