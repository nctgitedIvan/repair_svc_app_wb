'use strict';

const { Result } = require('@repair/shared-kernel/Result');
const { Permission } = require('@repair/domain/access/Permission');
const { OrderStatus } = require('@repair/domain/order/OrderStatus');
const { authorize } = require('../access/authorize');
const { appendOrderAudit } = require('../shared/audit');
const { toOrderDto } = require('../shared/orderDto');
const { ensureWorkOrderTicket } = require('../shared/workOrder');

/**
 * PayOrderUseCase —— 客戶支付自己的待付款訂單（P5）。
 *
 * 流程：AccessPolicy → 呼叫 PaymentGateway → order.markPaid → 存支付紀錄 → 建工單 → 稽核。
 * 真正的庫存扣減在 P6 的支付回調；P5 只模擬支付成功。
 */
class PayOrderUseCase {
  constructor({
    orderRepository,
    paymentRepository,
    paymentGateway,
    workOrderRepository,
    auditLogRepository,
    idGenerator,
    clock,
  }) {
    if (!orderRepository) throw new TypeError('PayOrderUseCase 需要 orderRepository');
    if (!paymentGateway) throw new TypeError('PayOrderUseCase 需要 paymentGateway');
    if (!idGenerator) throw new TypeError('PayOrderUseCase 需要 idGenerator');
    if (!clock) throw new TypeError('PayOrderUseCase 需要 clock');

    this.orderRepository = orderRepository;
    this.paymentRepository = paymentRepository || null;
    this.paymentGateway = paymentGateway;
    this.workOrderRepository = workOrderRepository || null;
    this.auditLogRepository = auditLogRepository || null;
    this.idGenerator = idGenerator;
    this.clock = clock;
  }

  async execute({ actor, orderId } = {}) {
    const order = await this.orderRepository.findById(orderId);
    if (!order) return Result.notFound(`訂單不存在：${orderId}`);

    // 先做角色／歸屬校驗（不帶 targetStatus，避免把「狀態不對」誤報成權限不足）
    const denied = authorize(actor, Permission.ORDER_PAY.key, { order });
    if (denied) return denied;

    if (order.statusKey !== OrderStatus.PENDING_PAYMENT.key) {
      return Result.preconditionFailed(`訂單狀態不可支付：${order.statusKey}`, {
        orderId,
        status: order.statusKey,
      });
    }

    const now = this.clock.now();
    const outTradeNo = this.idGenerator.nextOutTradeNo(order.orderNo.value);
    const totalCents = order.amounts.total.cents;

    const payment = await this.paymentGateway.createPayment({
      orderId,
      orderNo: order.orderNo.value,
      amountCents: totalCents,
      currency: order.amounts.total.currency,
      outTradeNo,
    });
    if (!payment || payment.ok === false) {
      return Result.upstreamFailed('支付建立失敗', {
        code: payment ? payment.code : 'NO_RESPONSE',
      });
    }

    const expectedVersion = order.version;
    order.markPaid({ at: now });
    await this.orderRepository.save(order, { expectedVersion });

    if (this.paymentRepository) {
      await this.paymentRepository.save({
        paymentId: `pay-${outTradeNo}`,
        orderId,
        outTradeNo,
        transactionId: payment.transactionId || null,
        amountCents: totalCents,
        currency: order.amounts.total.currency,
        status: 'paid',
        prepayAt: now,
        paidAt: now,
        createdAt: now,
      });
    }

    await ensureWorkOrderTicket({
      workOrderRepository: this.workOrderRepository,
      orderId,
      at: now,
      csAgentId: order.csAgentId,
    });

    await appendOrderAudit({
      auditLogRepository: this.auditLogRepository,
      orderId,
      actor,
      action: 'order.pay',
      at: now,
      details: { outTradeNo, amountCents: totalCents },
    });

    return Result.ok(toOrderDto(order));
  }
}

module.exports = { PayOrderUseCase };
