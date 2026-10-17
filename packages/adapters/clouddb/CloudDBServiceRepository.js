'use strict';

const { toRow, fromRow } = require('./mappers/service');

/** CloudDBServiceRepository —— `services` 的雲端實作（只寫不跑）。 */
function createCloudDBServiceRepository({ client } = {}) {
  if (!client || typeof client.collection !== 'function') {
    throw new TypeError('CloudDBServiceRepository 需要 CloudDBClient');
  }

  const collection = () => client.collection('services');

  return {
    async findById(serviceId) {
      assertString(serviceId, 'serviceId');
      try {
        const snapshot = await collection().doc(serviceId).get();
        return snapshot && snapshot.data ? fromRow({ ...snapshot.data, _id: serviceId }) : null;
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

    async save(service) {
      if (!service || typeof service !== 'object') {
        throw new TypeError('Service.save(service) 需要物件');
      }
      assertString(service.serviceId, 'serviceId');
      assertName(service.name, 'Service.name');
      await collection().doc(service.serviceId).set({ data: toRow(service) });
    },
  };
}

function assertString(value, name) {
  if (typeof value !== 'string' || value.length === 0) {
    throw new TypeError(`${name} 必須是非空字串`);
  }
}
function assertName(value, name) {
  assertString(value, name);
}
function isNotFound(err) {
  const text = `${(err && err.errCode) || ''} ${(err && err.code) || ''} ${
    (err && err.message) || ''
  }`.toLowerCase();
  return text.includes('not exist') || text.includes('not found') || text.includes('does not exist');
}

module.exports = { createCloudDBServiceRepository };
