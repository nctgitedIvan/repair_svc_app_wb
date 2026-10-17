'use strict';

const { toRow, fromRow } = require('./mappers/cart');

/** CloudDBCartRepository —— `carts` 的雲端實作（只寫不跑）。doc `_id` = userId。 */
function createCloudDBCartRepository({ client } = {}) {
  if (!client || typeof client.collection !== 'function') {
    throw new TypeError('CloudDBCartRepository 需要 CloudDBClient');
  }

  const collection = () => client.collection('carts');

  return {
    async findByUserId(userId) {
      assertString(userId, 'userId');
      try {
        const snapshot = await collection().doc(userId).get();
        return snapshot && snapshot.data ? fromRow(snapshot.data, userId) : null;
      } catch (err) {
        if (isNotFound(err)) return null;
        throw err;
      }
    },

    async save(cart) {
      if (!cart || typeof cart !== 'object') {
        throw new TypeError('Cart.save(cart) 需要物件');
      }
      assertString(cart.userId, 'userId');
      await collection().doc(cart.userId).set({ data: toRow(cart) });
    },

    async clearByUserId(userId) {
      assertString(userId, 'userId');
      try {
        await collection().doc(userId).remove();
      } catch (err) {
        if (!isNotFound(err)) throw err;
      }
    },
  };
}

function assertString(value, name) {
  if (typeof value !== 'string' || value.length === 0) {
    throw new TypeError(`${name} 必須是非空字串`);
  }
}
function isNotFound(err) {
  const text = `${(err && err.errCode) || ''} ${(err && err.code) || ''} ${
    (err && err.message) || ''
  }`.toLowerCase();
  return text.includes('not exist') || text.includes('not found') || text.includes('does not exist');
}

module.exports = { createCloudDBCartRepository };
