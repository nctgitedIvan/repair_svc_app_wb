'use strict';

const { Result } = require('@repair/shared-kernel/Result');
const { Permission } = require('@repair/domain/access/Permission');
const { OrderStatus } = require('@repair/domain/order/OrderStatus');
const { authorize } = require('../access/authorize');
const { appendOrderAudit } = require('../shared/audit');
const { toOrderDto } = require('../shared/orderDto');
const { appendWorkOrderMessage } = require('../shared/workOrder');

/** AssignOrderUseCase —— 客服指派師傅（P5）。 */
class AssignOrderUseCase {
  constructor({
    orderRepository,
    technicianRepository,
    workOrderRepository,
    workOrderMessageRepository,
    auditLogRepository,
    clock,
  }) {
    if (!orderRepository) throw new TypeError('AssignOrderUseCase 需要 orderRepository');
    if (!clock) throw new TypeError('AssignOrderUseCase 需要 clock');
    this.orderRepository = orderRepository;
    this.technicianRepository = technicianRepository || null;
    this.workOrderRepository = workOrderRepository || null;
    this.workOrderMessageRepository = workOrderMessageRepository || null;
    this.auditLogRepository = auditLogRepository || null;
    this.clock = clock;
  }

  async execute({ actor, orderId, technicianId } = {}) {
    const order = await this.orderRepository.findById(orderId);
    if (!order) return Result.notFound(`訂單不存在：${orderId}`);

    const technician = this.technicianRepository
      ? await this.technicianRepository.findById(technicianId)
      : null;

    const denied = authorize(actor, Permission.ORDER_ASSIGN.key, {
      order,
      technician: technician ? { regionCode: technician.regionCode || null } : null,
      regionCode: order.regionCode || null,
      targetStatus: OrderStatus.ASSIGNED_PENDING_ACCEPT.key,
    });
    if (denied) return denied;

    const now = this.clock.now();
    const expectedVersion = order.version;
    order.assignTo(technicianId, { at: now, by: actor.id });
    await this.orderRepository.save(order, { expectedVersion });

    await appendOrderAudit({
      auditLogRepository: this.auditLogRepository,
      orderId,
      actor,
      action: 'order.assign',
      at: now,
      details: { technicianId },
    });
    await appendWorkOrderMessage({
      workOrderRepository: this.workOrderRepository,
      workOrderMessageRepository: this.workOrderMessageRepository,
      orderId,
      actor,
      body: `已指派師傅 ${technicianId}`,
      at: now,
      messageId: `msg-${orderId}-assign-${now}`,
    });

    return Result.ok(toOrderDto(order));
  }
}

module.exports = { AssignOrderUseCase };
