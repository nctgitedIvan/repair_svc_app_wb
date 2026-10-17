'use strict';

/** work_order_tickets 集合的 row ↔ WorkOrderRecord 映射。 */

function toRow(ticket) {
  return {
    order_id: ticket.orderId,
    status: ticket.status || 'open',
    cs_agent_id: ticket.csAgentId || null,
    created_at: Number.isInteger(ticket.createdAt) ? ticket.createdAt : null,
    updated_at: Number.isInteger(ticket.updatedAt) ? ticket.updatedAt : null,
  };
}

function fromRow(row) {
  if (!row) return null;
  return {
    ticketId: row._id,
    orderId: row.order_id,
    status: row.status || 'open',
    csAgentId: row.cs_agent_id || null,
    createdAt: Number.isInteger(row.created_at) ? row.created_at : null,
    updatedAt: Number.isInteger(row.updated_at) ? row.updated_at : null,
  };
}

module.exports = { toRow, fromRow };
