'use strict';

/** work_order_messages 集合的 row ↔ MessageRecord 映射。 */

function toRow(message) {
  return {
    ticket_id: message.ticketId,
    actor_id: message.actorId,
    actor_role: message.actorRole,
    body: message.body,
    created_at: Number.isInteger(message.createdAt) ? message.createdAt : null,
  };
}

function fromRow(row) {
  if (!row) return null;
  return {
    messageId: row._id,
    ticketId: row.ticket_id,
    actorId: row.actor_id,
    actorRole: row.actor_role,
    body: row.body,
    createdAt: Number.isInteger(row.created_at) ? row.created_at : null,
  };
}

module.exports = { toRow, fromRow };
