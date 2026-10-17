'use strict';

const { toRow, fromRow } = require('./mappers/technician');

/** CloudDBTechnicianRepository —— `technicians` 的雲端實作（只寫不跑）。 */
function createCloudDBTechnicianRepository({ client } = {}) {
  if (!client || typeof client.collection !== 'function') {
    throw new TypeError('CloudDBTechnicianRepository 需要 CloudDBClient');
  }

  const collection = () => client.collection('technicians');

  return {
    async findById(technicianId) {
      assertString(technicianId, 'technicianId');
      try {
        const snapshot = await collection().doc(technicianId).get();
        return snapshot && snapshot.data ? fromRow({ ...snapshot.data, _id: technicianId }) : null;
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

    async save(technician) {
      if (!technician || typeof technician !== 'object') {
        throw new TypeError('Technician.save(technician) 需要物件');
      }
      assertString(technician.technicianId, 'technicianId');
      assertString(technician.userId, 'userId');
      await collection().doc(technician.technicianId).set({ data: toRow(technician) });
    },

    async listByStatus(status) {
      assertString(status, 'status');
      const result = await collection().where({ status }).limit(100).get();
      const rows = result && Array.isArray(result.data) ? result.data : [];
      return rows
        .map(fromRow)
        .sort((a, b) => String(a.name).localeCompare(String(b.name)));
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

module.exports = { createCloudDBTechnicianRepository };
