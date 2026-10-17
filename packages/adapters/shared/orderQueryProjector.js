'use strict';

const { discloseFor } = require('@repair/domain/order/policies/AddressDisclosurePolicy');
const { maskFor } = require('@repair/domain/order/policies/ContactMaskingPolicy');

/**
 * 把 `Order` 聚合投影成**依檢視者角色脫敏**的 DTO。
 *
 * 這是 P3 的核心：脫敏規則只呼叫 domain 的兩個 policy，
 * adapter 不自己寫 `if (role === 'technician')`。
 *
 * @param {{ order: object, viewer: object, customer: object|null, now: number, config?: object }} args
 */
function projectOrder({ order, viewer, customer, now, config = {} }) {
  if (!order) return null;

  const addressView = discloseFor({ viewer, order, now, config });
  const phone = maskFor({
    viewer,
    customer: customer
      ? { userId: customer.userId, phone: customer.phone }
      : null,
  });

  return {
    orderId: order.id,
    orderNo: order.orderNo.value,
    status: order.statusKey,
    statusLabel: order.status.label,
    customerId: order.customerId,
    technicianId: order.technicianId,
    amounts: {
      serviceFeeCents: order.amounts.serviceFee.cents,
      materialFeeCents: order.amounts.materialFee.cents,
      totalCents: order.amounts.total.cents,
      currency: order.amounts.total.currency,
    },
    address: addressView.toJSON(),
    customerPhone: phone.level === 'FULL' ? phone.phone : phone.phone ? phone.phone.masked : null,
    customerPhoneLevel: phone.level,
    items: order.items.map((item) => item.toJSON()),
    timeline: order.timeline.map((log) => log.toJSON()),
    appointmentAt: order.appointmentAt,
    createdAt: order.createdAt,
    completedAt: order.completedAt,
    version: order.version,
  };
}

module.exports = { projectOrder };
