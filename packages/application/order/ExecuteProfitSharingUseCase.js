'use strict';

const { Result } = require('@repair/shared-kernel/Result');
const { Permission } = require('@repair/domain/access/Permission');
const { canExecuteProfitSharing } = require('@repair/domain/order/OrderStatus');
const { calculate } = require('@repair/domain/settlement/ProfitSharingPolicy');
const { authorize } = require('../access/authorize');
const { appendOrderAudit } = require('../shared/audit');

/**
 * ExecuteProfitSharingUseCase —— 執行分帳（P5）。
 *
 * - AccessPolicy：`settlement.execute`
 * - 狀態不可分帳（DISPUTED／VOIDED／未完成）→ 拒絕
 * - 呼叫 PaymentGateway.executeProfitSharing（P5 用 Mock）
 * - 寫入 profit_sharing_records 與稽核
 */
class ExecuteProfitSharingUseCase {
  constructor({ orderRepository, profitSharingRepository, paymentGateway, auditLogRepository, clock }) {
    if (!orderRepository) throw new TypeError('ExecuteProfitSharingUseCase 需要 orderRepository');
    if (!paymentGateway) throw new TypeError('ExecuteProfitSharingUseCase 需要 paymentGateway');
    if (!clock) throw new TypeError('ExecuteProfitSharingUseCase 需要 clock');

    this.orderRepository = orderRepository;
    this.profitSharingRepository = profitSharingRepository || null;
    this.paymentGateway = paymentGateway;
    this.auditLogRepository = auditLogRepository || null;
    this.clock = clock;
  }

  async execute({ actor, orderId } = {}) {
    const order = await this.orderRepository.findById(orderId);
    if (!order) return Result.notFound(`訂單不存在：${orderId}`);

    const denied = authorize(actor, Permission.SETTLEMENT_EXECUTE.key, { order });
    if (denied) return denied;

    if (!canExecuteProfitSharing(order.status)) {
      return Result.preconditionFailed(`狀態「${order.status.label}」不可執行分帳`, {
        orderId,
        status: order.statusKey,
      });
    }
    if (!order.technicianId) {
      return Result.preconditionFailed('訂單尚未指派師傅', { orderId });
    }

    const share = calculate({ order, terms: order.snapshot.profitSharingTerms });
    const now = this.clock.now();
    const outOrderNo = `PS${order.orderNo.value}`;

    const gatewayResult = await this.paymentGateway.executeProfitSharing({
      orderId,
      orderNo: order.orderNo.value,
      outOrderNo,
      receiverId: order.technicianId,
      amountCents: share.technicianShare.cents,
    });
    if (!gatewayResult || gatewayResult.ok === false) {
      return Result.upstreamFailed('分帳失敗', {
        code: gatewayResult ? gatewayResult.code : 'NO_RESPONSE',
      });
    }

    if (this.profitSharingRepository) {
      await this.profitSharingRepository.save({
        sharingId: `sharing-${outOrderNo}`,
        orderId,
        outOrderNo,
        technicianId: order.technicianId,
        amountCents: share.technicianShare.cents,
        currency: share.currency,
        status: 'success',
        providerId: gatewayResult.providerId || null,
        createdAt: now,
        updatedAt: now,
      });
    }

    await appendOrderAudit({
      auditLogRepository: this.auditLogRepository,
      orderId,
      actor,
      action: 'settlement.execute',
      at: now,
      details: {
        outOrderNo,
        technicianShareCents: share.technicianShare.cents,
        platformShareCents: share.platformShare.cents,
      },
    });

    return Result.ok({
      orderId,
      outOrderNo,
      technicianShareCents: share.technicianShare.cents,
      platformShareCents: share.platformShare.cents,
      currency: share.currency,
      status: 'success',
    });
  }
}

module.exports = { ExecuteProfitSharingUseCase };
