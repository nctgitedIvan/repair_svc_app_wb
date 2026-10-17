'use strict';

/** inquiries 集合的 row ↔ InquiryRecord 映射（doc `_id` = inquiryId）。 */

function snapshotToRow(snapshot) {
  if (!snapshot) return { name: '', image: '', price_cents: 0 };
  return {
    name: snapshot.name || '',
    image: snapshot.image || '',
    price_cents: Number.isInteger(snapshot.priceCents) ? snapshot.priceCents : 0,
  };
}

function snapshotFromRow(row) {
  if (!row) return { name: '', image: '', priceCents: 0 };
  return {
    name: row.name || '',
    image: row.image || '',
    priceCents: Number.isInteger(row.price_cents) ? row.price_cents : 0,
  };
}

function replyToRow(reply) {
  return {
    actor_id: reply.actorId || null,
    actor_role: reply.actorRole || null,
    body: reply.body || '',
    created_at: Number.isInteger(reply.createdAt) ? reply.createdAt : null,
  };
}

function replyFromRow(row) {
  return {
    actorId: row.actor_id || null,
    actorRole: row.actor_role || null,
    body: row.body || '',
    createdAt: Number.isInteger(row.created_at) ? row.created_at : null,
  };
}

function toRow(inquiry) {
  return {
    customer_id: inquiry.customerId,
    product_id: inquiry.productId,
    product_snapshot: snapshotToRow(inquiry.productSnapshot),
    message: inquiry.message || '',
    status: inquiry.status || 'pending',
    created_at: Number.isInteger(inquiry.createdAt) ? inquiry.createdAt : null,
    cs_agent_id: inquiry.csAgentId || null,
    replies: Array.isArray(inquiry.replies) ? inquiry.replies.map(replyToRow) : [],
  };
}

function fromRow(row) {
  if (!row) return null;
  return {
    inquiryId: row._id,
    customerId: row.customer_id,
    productId: row.product_id,
    productSnapshot: snapshotFromRow(row.product_snapshot),
    message: row.message || '',
    status: row.status || 'pending',
    createdAt: Number.isInteger(row.created_at) ? row.created_at : null,
    csAgentId: row.cs_agent_id || null,
    replies: Array.isArray(row.replies) ? row.replies.map(replyFromRow) : [],
  };
}

module.exports = { toRow, fromRow };
