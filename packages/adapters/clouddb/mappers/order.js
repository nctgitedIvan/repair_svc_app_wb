'use strict';

/**
 * orders 集合的 row ↔ Order.toPersistence() 映射。
 *
 * 注意：`Order` 的持久化形狀是 camelCase（domain 的 toPersistence），
 * 這裡逐欄位轉成 DB 的 snake_case；讀取時再轉回來。
 */

function toRow(order) {
  const data = order.toPersistence();
  return {
    order_no: data.orderNo,
    merchant_id: data.merchantId || 'platform',
    customer_id: data.customerId,
    cs_agent_id: data.csAgentId,
    technician_id: data.technicianId,
    status: data.statusValue,
    service_fee_cents: data.serviceFeeCents,
    material_fee_cents: data.materialFeeCents,
    total_cents: data.totalCents,
    currency: data.currency,
    address: {
      province: data.address.province,
      city: data.address.city,
      district: data.address.district,
      street: data.address.street,
      detail_address: data.address.detailAddress,
    },
    appointment_at: data.appointmentAt,
    snapshot: {
      profit_sharing_terms: {
        base: data.snapshot.profitSharingTerms.base,
        technician_rate_bp: data.snapshot.profitSharingTerms.technicianRateBp,
        platform_rate_bp: data.snapshot.profitSharingTerms.platformRateBp,
        rounding_mode: data.snapshot.profitSharingTerms.roundingMode,
        terms_version: data.snapshot.profitSharingTerms.termsVersion,
      },
      pricing_version: data.snapshot.pricingVersion,
    },
    version: data.version,
    created_at: data.createdAt,
    paid_at: data.paidAt,
    completed_at: data.completedAt,
    voided_reason: data.voidedReason,
  };
}

/** row + 明細 + 歷程 → Order.rehydrate() 要的形狀 */
function toRehydrateInput(row, itemRows, logRows) {
  return {
    orderId: row._id,
    orderNo: row.order_no,
    merchantId: row.merchant_id || 'platform',
    customerId: row.customer_id,
    csAgentId: row.cs_agent_id,
    technicianId: row.technician_id,
    statusValue: row.status,
    items: itemRows,
    serviceFeeCents: row.service_fee_cents,
    materialFeeCents: row.material_fee_cents,
    totalCents: row.total_cents,
    currency: row.currency,
    address: {
      province: row.address.province,
      city: row.address.city,
      district: row.address.district,
      street: row.address.street,
      detailAddress: row.address.detail_address,
    },
    appointmentAt: row.appointment_at,
    snapshot: {
      profitSharingTerms: {
        base: row.snapshot.profit_sharing_terms.base,
        technicianRateBp: row.snapshot.profit_sharing_terms.technician_rate_bp,
        platformRateBp: row.snapshot.profit_sharing_terms.platform_rate_bp,
        roundingMode: row.snapshot.profit_sharing_terms.rounding_mode,
        termsVersion: row.snapshot.profit_sharing_terms.terms_version,
      },
      pricingVersion: row.snapshot.pricing_version,
    },
    timeline: logRows,
    version: row.version,
    createdAt: row.created_at,
    paidAt: row.paid_at,
    completedAt: row.completed_at,
    voidedReason: row.voided_reason,
  };
}

module.exports = { toRow, toRehydrateInput };
