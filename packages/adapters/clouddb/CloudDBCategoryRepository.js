'use strict';

const { toRow, fromRow } = require('./mappers/category');

/**
 * CloudDBCategoryRepository —— `categories` 的雲端實作（只寫不跑）。
 *
 * doc `_id` 就是 `categoryId`，因此 find/save 都是單記錄操作。
 *
 * @param {{ client: object }} deps
 */
function createCloudDBCategoryRepository({ client } = {}) {
  if (!client || typeof client.collection !== 'function') {
    throw new TypeError('CloudDBCategoryRepository 需要 CloudDBClient');
  }

  const collection = () => client.collection('categories');

  return {
    async list() {
      const result = await collection().orderBy('order', 'asc').limit(100).get();
      const rows = result && Array.isArray(result.data) ? result.data : [];
      return rows
        .map(fromRow)
        .sort((a, b) => {
          const orderDiff = (a.order ?? 0) - (b.order ?? 0);
          if (orderDiff !== 0) return orderDiff;
          return String(a.name).localeCompare(String(b.name));
        });
    },

    async findById(categoryId) {
      assertId(categoryId);
      try {
        const snapshot = await collection().doc(categoryId).get();
        return snapshot && snapshot.data ? fromRow({ ...snapshot.data, _id: categoryId }) : null;
      } catch (err) {
        if (isNotFound(err)) return null;
        throw err;
      }
    },

    async save(category) {
      if (!category || typeof category !== 'object') {
        throw new TypeError('Category.save(category) 需要物件');
      }
      assertId(category.categoryId);
      if (typeof category.name !== 'string' || category.name.length === 0) {
        throw new TypeError('Category.name 必須是非空字串');
      }

      await collection()
        .doc(category.categoryId)
        .set({ data: toRow(category) });
    },
  };
}

function assertId(categoryId) {
  if (typeof categoryId !== 'string' || categoryId.length === 0) {
    throw new TypeError('Category.categoryId 必須是非空字串');
  }
}

function isNotFound(err) {
  const text = `${(err && err.errCode) || ''} ${(err && err.code) || ''} ${
    (err && err.message) || ''
  }`.toLowerCase();
  return (
    text.includes('not exist') ||
    text.includes('not found') ||
    text.includes('does not exist') ||
    text.includes('document_not_exist')
  );
}

module.exports = { createCloudDBCategoryRepository };
