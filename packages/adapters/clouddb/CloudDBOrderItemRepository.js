'use strict';

const { toRow, fromRow } = require('./mappers/orderItem');

/** CloudDBOrderItemRepository —— `order_items` 的雲端實作（只寫不跑）。 */
function createCloudDBOrderItemRepository({ client } = {}) {
  if (!client || typeof client.collection !== 'function') {
    throw new TypeError('CloudDBOrderItemRepository 需要 CloudDBClient');
  }

  const collection = () => client.collection('order_items');

  return {
    async listByOrderId(orderId) {
      assertString(orderId, 'orderId');
      const result = await collection()
        .where({ order_id: orderId })
        .orderBy('item_index', 'asc')
        .limit(100)
        .get();
      return (result && Array.isArray(result.data) ? result.data : []).map(fromRow);
    },

    async saveForOrder(orderId, items) {
      assertString(orderId, 'orderId');
      if (!Array.isArray(items)) throw new TypeError('items 必須是陣列');
      await Promise.all(
        items.map((item, index) =>
          collection()
            .doc(`${orderId}:item:${index}`)
            .set({ data: toRow(item, orderId, index) }),
        ),
      );
    },
  };
}

function assertString(value, name) {
  if (typeof value !== 'string' || value.length === 0) {
    throw new TypeError(`${name} 必須是非空字串`);
  }
}

module.exports = { createCloudDBOrderItemRepository };
