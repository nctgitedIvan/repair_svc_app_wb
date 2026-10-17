'use strict';

const { toRow, fromRow } = require('./mappers/workOrder');

/** CloudDBWorkOrderRepository —— `work_order_tickets` 的雲端實作（只寫不跑）。 */
function createCloudDBWorkOrderRepository({ client } = {}) {
  if (!client || typeof client.collection !== 'function') {
    throw new TypeError('CloudDBWorkOrderRepository 需要 CloudDBClient');
  }
  const collection = () => client.collection('work_order_tickets');

  return {
    async findByOrderId(orderId) {
      assertString(orderId, 'orderId');
      const result = await collection().where({ order_id: orderId }).limit(1).get();
      const row = result && Array.isArray(result.data) ? result.data[0] : null;
      return row ? fromRow(row) : null;
    },

    async listByStatus(status) {
      assertString(status, 'status');
      const result = await collection()
        .where({ status })
        .orderBy('created_at', 'asc')
        .limit(100)
        .get();
      return (result && Array.isArray(result.data) ? result.data : []).map(fromRow);
    },

    async save(ticket) {
      if (!ticket || typeof ticket !== 'object') {
        throw new TypeError('WorkOrder.save(ticket) 需要物件');
      }
      assertString(ticket.ticketId, 'ticketId');
      assertString(ticket.orderId, 'orderId');
      await collection().doc(ticket.ticketId).set({ data: toRow(ticket) });
    },
  };
}

function assertString(value, name) {
  if (typeof value !== 'string' || value.length === 0) {
    throw new TypeError(`${name} 必須是非空字串`);
  }
}

module.exports = { createCloudDBWorkOrderRepository };
