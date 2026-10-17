'use strict';

const { Result } = require('@repair/shared-kernel/Result');
const { Permission } = require('@repair/domain/access/Permission');
const { OrderStatus } = require('@repair/domain/order/OrderStatus');
const { authorize } = require('../access/authorize');
const { appendOrderAudit } = require('../shared/audit');
const { toOrderDto } = require('../shared/orderDto');
const { appendWorkOrderMessage } = require('../shared/workOrder');

/** AcceptOrderUseCase —— 師傅接單（P5）。 */
class AcceptOrderUseCase {
  constructor({ orderRepository, workOrderRepository, workOrderMessageRepository, auditLogRepository, clock }) {
    if (!orderRepository) throw new TypeError('AcceptOrderUseCase 需要 orderRepository');
    if (!clock) throw new TypeError('AcceptOrderUseCase 需要 clock');
    this.orderRepository = orderRepository;
    this.workOrderRepository = workOrderRepository || null;
    this.workOrderMessageRepository = workOrderMessageRepository || null;
    this.auditLogRepository = auditLogRepository || null;
    this.clock = clock;
  }

  async execute({ actor, orderId } = {}) {
    const order = await this.orderRepository.findById(orderId);
    if (!order) return Result.notFound(`訂單不存在：${orderId}`);

    const denied = authorize(actor, Permission.ORDER_ACCEPT.key, {
      order,
      targetStatus: OrderStatus.ACCEPTED_PENDING_VISIT.key,
    });
    if (denied) return denied;

    const now = this.clock.now();
    const expectedVersion = order.version;
    order.accept({ at: now, by: actor.id });
    await this.orderRepository.save(order, { expectedVersion });

    await appendOrderAudit({
      auditLogRepository: this.auditLogRepository,
      orderId,
      actor,
      action: 'order.accept',
      at: now,
    });
    await appendWorkOrderMessage({
      workOrderRepository: this.workOrderRepository,
      workOrderMessageRepository: this.workOrderMessageRepository,
      orderId,
      actor,
      body: '師傅已接單',
      at: now,
      messageId: `msg-${orderId}-accept-${now}`,
    });

    return Result.ok(toOrderDto(order));
  }
}

module.exports = { AcceptOrderUseCase };
