'use strict';

/** profit_sharing_records／profit_sharing_return_records 的映射。 */

function sharingToRow(sharing) {
  return {
    order_id: sharing.orderId,
    out_order_no: sharing.outOrderNo,
    technician_id: sharing.technicianId || null,
    amount_cents: sharing.amountCents,
    currency: sharing.currency || 'CNY',
    status: sharing.status || 'pending',
    provider_id: sharing.providerId || null,
    created_at: Number.isInteger(sharing.createdAt) ? sharing.createdAt : null,
    updated_at: Number.isInteger(sharing.updatedAt) ? sharing.updatedAt : null,
  };
}

function sharingFromRow(row) {
  if (!row) return null;
  return {
    sharingId: row._id,
    orderId: row.order_id,
    outOrderNo: row.out_order_no,
    technicianId: row.technician_id || null,
    amountCents: row.amount_cents,
    currency: row.currency || 'CNY',
    status: row.status || 'pending',
    providerId: row.provider_id || null,
    createdAt: Number.isInteger(row.created_at) ? row.created_at : null,
    updatedAt: Number.isInteger(row.updated_at) ? row.updated_at : null,
  };
}

function returnToRow(record) {
  return {
    order_id: record.orderId,
    out_order_no: record.outOrderNo,
    amount_cents: record.amountCents,
    currency: record.currency || 'CNY',
    status: record.status || 'pending',
    created_at: Number.isInteger(record.createdAt) ? record.createdAt : null,
  };
}

function returnFromRow(row) {
  if (!row) return null;
  return {
    returnId: row._id,
    orderId: row.order_id,
    outOrderNo: row.out_order_no,
    amountCents: row.amount_cents,
    currency: row.currency || 'CNY',
    status: row.status || 'pending',
    createdAt: Number.isInteger(row.created_at) ? row.created_at : null,
  };
}

module.exports = { sharingToRow, sharingFromRow, returnToRow, returnFromRow };
