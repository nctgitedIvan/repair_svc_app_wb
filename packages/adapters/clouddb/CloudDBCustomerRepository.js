'use strict';

const { toRow, fromRow } = require('./mappers/customer');

/** CloudDBCustomerRepository —— `customers` 的雲端實作（只寫不跑）。 */
function createCloudDBCustomerRepository({ client } = {}) {
  if (!client || typeof client.collection !== 'function') {
    throw new TypeError('CloudDBCustomerRepository 需要 CloudDBClient');
  }

  const collection = () => client.collection('customers');

  return {
    async findById(customerId) {
      assertString(customerId, 'customerId');
      try {
        const snapshot = await collection().doc(customerId).get();
        return snapshot && snapshot.data ? fromRow({ ...snapshot.data, _id: customerId }) : null;
      } catch (err) {
        if (isNotFound(err)) return null;
        throw err;
      }
    },

    async findByUserId(userId) {
      assertString(userId, 'userId');
      const result = await collection().where({ user_id: userId }).limit(1).get();
      const row = result && Array.isArray(result.data) ? result.data[0] : null;
      return row ? fromRow(row) : null;
    },

    async save(customer) {
      if (!customer || typeof customer !== 'object') {
        throw new TypeError('Customer.save(customer) 需要物件');
      }
      assertString(customer.customerId, 'customerId');
      assertString(customer.userId, 'userId');
      await collection().doc(customer.customerId).set({ data: toRow(customer) });
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

module.exports = { createCloudDBCustomerRepository };
