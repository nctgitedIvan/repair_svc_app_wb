'use strict';

/** payment_records 集合的 row ↔ PaymentRecord 映射。 */

function toRow(payment) {
  return {
    order_id: payment.orderId,
    out_trade_no: payment.outTradeNo,
    transaction_id: payment.transactionId || null,
    amount_cents: payment.amountCents,
    currency: payment.currency || 'CNY',
    status: payment.status || 'pending',
    prepay_at: Number.isInteger(payment.prepayAt) ? payment.prepayAt : null,
    paid_at: Number.isInteger(payment.paidAt) ? payment.paidAt : null,
    created_at: Number.isInteger(payment.createdAt) ? payment.createdAt : null,
  };
}

function fromRow(row) {
  if (!row) return null;
  return {
    paymentId: row._id,
    orderId: row.order_id,
    outTradeNo: row.out_trade_no,
    transactionId: row.transaction_id || null,
    amountCents: row.amount_cents,
    currency: row.currency || 'CNY',
    status: row.status || 'pending',
    prepayAt: Number.isInteger(row.prepay_at) ? row.prepay_at : null,
    paidAt: Number.isInteger(row.paid_at) ? row.paid_at : null,
    createdAt: Number.isInteger(row.created_at) ? row.created_at : null,
  };
}

module.exports = { toRow, fromRow };
