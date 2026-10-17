'use strict';

const { toRow, fromRow } = require('./mappers/favorite');

/** CloudDBFavoriteRepository —— `favorites` 的雲端實作（只寫不跑）。 */
function createCloudDBFavoriteRepository({ client } = {}) {
  if (!client || typeof client.collection !== 'function') {
    throw new TypeError('CloudDBFavoriteRepository 需要 CloudDBClient');
  }

  const collection = () => client.collection('favorites');
  const idOf = (customerId, productId) => `${customerId}:${productId}`;

  return {
    async listByCustomer(customerId) {
      assertString(customerId, 'customerId');
      const result = await collection()
        .where({ customer_id: customerId })
        .orderBy('created_at', 'desc')
        .limit(200)
        .get();
      return (result && Array.isArray(result.data) ? result.data : []).map(fromRow);
    },

    async isFavorite(customerId, productId) {
      assertString(customerId, 'customerId');
      assertString(productId, 'productId');
      try {
        const snapshot = await collection().doc(idOf(customerId, productId)).get();
        return !!(snapshot && snapshot.data);
      } catch (err) {
        if (isNotFound(err)) return false;
        throw err;
      }
    },

    async add(favorite) {
      if (!favorite || typeof favorite !== 'object') {
        throw new TypeError('Favorite.add(favorite) 需要物件');
      }
      assertString(favorite.customerId, 'customerId');
      assertString(favorite.productId, 'productId');
      // doc id 保證唯一；重複 add 不會產生第二筆
      await collection()
        .doc(idOf(favorite.customerId, favorite.productId))
        .set({ data: toRow(favorite) });
    },

    async remove(customerId, productId) {
      assertString(customerId, 'customerId');
      assertString(productId, 'productId');
      try {
        await collection().doc(idOf(customerId, productId)).remove();
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

module.exports = { createCloudDBFavoriteRepository };
