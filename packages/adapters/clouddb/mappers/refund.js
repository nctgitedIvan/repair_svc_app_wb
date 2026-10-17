'use strict';

/** refund_records 集合的 row ↔ RefundRecord 映射。 */

function toRow(refund) {
  return {
    order_id: refund.orderId,
    out_refund_no: refund.outRefundNo,
    amount_cents: refund.amountCents,
    currency: refund.currency || 'CNY',
    status: refund.status || 'requested',
    reason: refund.reason || null,
    requested_at: Number.isInteger(refund.requestedAt) ? refund.requestedAt : null,
    processed_at: Number.isInteger(refund.processedAt) ? refund.processedAt : null,
    created_at: Number.isInteger(refund.createdAt) ? refund.createdAt : null,
  };
}

function fromRow(row) {
  if (!row) return null;
  return {
    refundId: row._id,
    orderId: row.order_id,
    outRefundNo: row.out_refund_no,
    amountCents: row.amount_cents,
    currency: row.currency || 'CNY',
    status: row.status || 'requested',
    reason: row.reason || null,
    requestedAt: Number.isInteger(row.requested_at) ? row.requested_at : null,
    processedAt: Number.isInteger(row.processed_at) ? row.processed_at : null,
    createdAt: Number.isInteger(row.created_at) ? row.created_at : null,
  };
}

module.exports = { toRow, fromRow };
