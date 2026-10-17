'use strict';

const {
  sharingToRow,
  sharingFromRow,
  returnToRow,
  returnFromRow,
} = require('./mappers/profitSharing');

/** CloudDBProfitSharingRepository —— 分帳／回退紀錄（只寫不跑）。 */
function createCloudDBProfitSharingRepository({ client } = {}) {
  if (!client || typeof client.collection !== 'function') {
    throw new TypeError('CloudDBProfitSharingRepository 需要 CloudDBClient');
  }

  const sharings = () => client.collection('profit_sharing_records');
  const returns = () => client.collection('profit_sharing_return_records');

  return {
    async findByOutOrderNo(outOrderNo) {
      assertString(outOrderNo, 'outOrderNo');
      const result = await sharings().where({ out_order_no: outOrderNo }).limit(1).get();
      const row = result && Array.isArray(result.data) ? result.data[0] : null;
      return row ? sharingFromRow(row) : null;
    },

    async listByOrderId(orderId) {
      assertString(orderId, 'orderId');
      const result = await sharings()
        .where({ order_id: orderId })
        .orderBy('created_at', 'desc')
        .limit(100)
        .get();
      return (result && Array.isArray(result.data) ? result.data : []).map(sharingFromRow);
    },

    async save(sharing) {
      if (!sharing || typeof sharing !== 'object') {
        throw new TypeError('ProfitSharing.save(sharing) 需要物件');
      }
      assertString(sharing.sharingId, 'sharingId');
      assertString(sharing.orderId, 'orderId');
      assertString(sharing.outOrderNo, 'outOrderNo');
      await sharings().doc(sharing.sharingId).set({ data: sharingToRow(sharing) });
    },

    async saveReturn(record) {
      if (!record || typeof record !== 'object') {
        throw new TypeError('ProfitSharing.saveReturn(record) 需要物件');
      }
      assertString(record.returnId, 'returnId');
      assertString(record.orderId, 'orderId');
      await returns().doc(record.returnId).set({ data: returnToRow(record) });
    },

    async listReturnsByOrderId(orderId) {
      assertString(orderId, 'orderId');
      const result = await returns()
        .where({ order_id: orderId })
        .orderBy('created_at', 'desc')
        .limit(100)
        .get();
      return (result && Array.isArray(result.data) ? result.data : []).map(returnFromRow);
    },
  };
}

function assertString(value, name) {
  if (typeof value !== 'string' || value.length === 0) {
    throw new TypeError(`${name} 必須是非空字串`);
  }
}

module.exports = { createCloudDBProfitSharingRepository };
