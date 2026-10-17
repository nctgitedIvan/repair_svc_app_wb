'use strict';

const { toRow, fromRow } = require('./mappers/refund');

/** CloudDBRefundRepository —— `refund_records` 的雲端實作（只寫不跑）。 */
function createCloudDBRefundRepository({ client } = {}) {
  if (!client || typeof client.collection !== 'function') {
    throw new TypeError('CloudDBRefundRepository 需要 CloudDBClient');
  }
  const collection = () => client.collection('refund_records');

  return {
    async findByOutRefundNo(outRefundNo) {
      assertString(outRefundNo, 'outRefundNo');
      const result = await collection().where({ out_refund_no: outRefundNo }).limit(1).get();
      const row = result && Array.isArray(result.data) ? result.data[0] : null;
      return row ? fromRow(row) : null;
    },

    async listByOrderId(orderId) {
      assertString(orderId, 'orderId');
      const result = await collection()
        .where({ order_id: orderId })
        .orderBy('created_at', 'desc')
        .limit(100)
        .get();
      return (result && Array.isArray(result.data) ? result.data : []).map(fromRow);
    },

    async save(refund) {
      if (!refund || typeof refund !== 'object') {
        throw new TypeError('Refund.save(refund) 需要物件');
      }
      assertString(refund.refundId, 'refundId');
      assertString(refund.orderId, 'orderId');
      assertString(refund.outRefundNo, 'outRefundNo');
      await collection().doc(refund.refundId).set({ data: toRow(refund) });
    },
  };
}

function assertString(value, name) {
  if (typeof value !== 'string' || value.length === 0) {
    throw new TypeError(`${name} 必須是非空字串`);
  }
}

module.exports = { createCloudDBRefundRepository };
