'use strict';

const { toRow, fromRow } = require('./mappers/product');

/** CloudDBProductRepository —— `products` 的雲端實作（只寫不跑）。 */
function createCloudDBProductRepository({ client } = {}) {
  if (!client || typeof client.collection !== 'function') {
    throw new TypeError('CloudDBProductRepository 需要 CloudDBClient');
  }

  const collection = () => client.collection('products');

  return {
    async findById(productId) {
      assertString(productId, 'productId');
      try {
        const snapshot = await collection().doc(productId).get();
        return snapshot && snapshot.data ? fromRow({ ...snapshot.data, _id: productId }) : null;
      } catch (err) {
        if (isNotFound(err)) return null;
        throw err;
      }
    },

    async listActive() {
      const result = await collection().where({ is_active: true }).limit(100).get();
      const rows = result && Array.isArray(result.data) ? result.data : [];
      return rows
        .map(fromRow)
        .sort((a, b) => {
          const diff = (a.order ?? 0) - (b.order ?? 0);
          return diff !== 0 ? diff : String(a.name).localeCompare(String(b.name));
        });
    },

    async save(product) {
      if (!product || typeof product !== 'object') {
        throw new TypeError('Product.save(product) 需要物件');
      }
      assertString(product.productId, 'productId');
      assertString(product.name, 'Product.name');
      await collection().doc(product.productId).set({ data: toRow(product) });
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

module.exports = { createCloudDBProductRepository };
