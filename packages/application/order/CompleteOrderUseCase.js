'use strict';

const { Result } = require('@repair/shared-kernel/Result');
const { Permission } = require('@repair/domain/access/Permission');
const { OrderStatus } = require('@repair/domain/order/OrderStatus');
const { authorize } = require('../access/authorize');
const { appendOrderAudit } = require('../shared/audit');
const { toOrderDto } = require('../shared/orderDto');
const { appendWorkOrderMessage } = require('../shared/workOrder');

/** CompleteOrderUseCase —— 師傅完工（P5）。 */
class CompleteOrderUseCase {
  constructor({ orderRepository, workOrderRepository, workOrderMessageRepository, auditLogRepository, clock }) {
    if (!orderRepository) throw new TypeError('CompleteOrderUseCase 需要 orderRepository');
    if (!clock) throw new TypeError('CompleteOrderUseCase 需要 clock');
    this.orderRepository = orderRepository;
    this.workOrderRepository = workOrderRepository || null;
    this.workOrderMessageRepository = workOrderMessageRepository || null;
    this.auditLogRepository = auditLogRepository || null;
    this.clock = clock;
  }

  async execute({ actor, orderId } = {}) {
    const order = await this.orderRepository.findById(orderId);
    if (!order) return Result.notFound(`訂單不存在：${orderId}`);

    const now = this.clock.now();
    const expectedVersion = order.version;

    // 狀態機要求先 IN_SERVICE 才能完工；若師傅尚未回報到場，這裡一併處理。
    if (order.statusKey === OrderStatus.ACCEPTED_PENDING_VISIT.key) {
      const arriveDenied = authorize(actor, Permission.ORDER_ARRIVE.key, {
        order,
        targetStatus: OrderStatus.IN_SERVICE.key,
      });
      if (arriveDenied) return arriveDenied;
      order.reportArrival({ at: now, by: actor.id });
    }

    const denied = authorize(actor, Permission.ORDER_COMPLETE.key, {
      order,
      targetStatus: OrderStatus.PENDING_ACCEPTANCE.key,
    });
    if (denied) return denied;

    order.completeService({ at: now, by: actor.id });
    await this.orderRepository.save(order, { expectedVersion });

    await appendOrderAudit({
      auditLogRepository: this.auditLogRepository,
      orderId,
      actor,
      action: 'order.complete_service',
      at: now,
    });
    await appendWorkOrderMessage({
      workOrderRepository: this.workOrderRepository,
      workOrderMessageRepository: this.workOrderMessageRepository,
      orderId,
      actor,
      body: '師傅已完工，待客戶驗收',
      at: now,
      messageId: `msg-${orderId}-complete-${now}`,
    });

    return Result.ok(toOrderDto(order));
  }
}

module.exports = { CompleteOrderUseCase };
