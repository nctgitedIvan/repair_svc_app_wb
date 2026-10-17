'use strict';

const { toRow, fromRow } = require('./mappers/workOrderMessage');

/** CloudDBWorkOrderMessageRepository —— `work_order_messages`（只寫不跑）。 */
function createCloudDBWorkOrderMessageRepository({ client } = {}) {
  if (!client || typeof client.collection !== 'function') {
    throw new TypeError('CloudDBWorkOrderMessageRepository 需要 CloudDBClient');
  }
  const collection = () => client.collection('work_order_messages');

  return {
    async listByTicketId(ticketId) {
      assertString(ticketId, 'ticketId');
      const result = await collection()
        .where({ ticket_id: ticketId })
        .orderBy('created_at', 'asc')
        .limit(500)
        .get();
      return (result && Array.isArray(result.data) ? result.data : []).map(fromRow);
    },

    async append(message) {
      if (!message || typeof message !== 'object') {
        throw new TypeError('WorkOrderMessage.append(message) 需要物件');
      }
      assertString(message.messageId, 'messageId');
      assertString(message.ticketId, 'ticketId');
      await collection().doc(message.messageId).set({ data: toRow(message) });
    },
  };
}

function assertString(value, name) {
  if (typeof value !== 'string' || value.length === 0) {
    throw new TypeError(`${name} 必須是非空字串`);
  }
}

module.exports = { createCloudDBWorkOrderMessageRepository };
