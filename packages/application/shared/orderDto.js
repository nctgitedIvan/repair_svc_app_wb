'use strict';

/** Order 聚合 → 對外 DTO（不含實體、不含方法）。 */
function toOrderDto(order) {
  return {
    orderId: order.id,
    orderNo: order.orderNo.value,
    merchantId: order.merchantId || 'platform',
    status: order.statusKey,
    statusLabel: order.status.label,
    customerId: order.customerId,
    csAgentId: order.csAgentId,
    technicianId: order.technicianId,
    amounts: {
      serviceFeeCents: order.amounts.serviceFee.cents,
      materialFeeCents: order.amounts.materialFee.cents,
      totalCents: order.amounts.total.cents,
      currency: order.amounts.total.currency,
    },
    appointmentAt: order.appointmentAt,
    createdAt: order.createdAt,
    version: order.version,
  };
}

module.exports = { toOrderDto };
