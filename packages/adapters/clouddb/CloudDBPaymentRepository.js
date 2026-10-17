'use strict';

const { toRow, fromRow } = require('./mappers/payment');

/** CloudDBPaymentRepository —— `payment_records` 的雲端實作（只寫不跑）。 */
function createCloudDBPaymentRepository({ client } = {}) {
  if (!client || typeof client.collection !== 'function') {
    throw new TypeError('CloudDBPaymentRepository 需要 CloudDBClient');
  }
  const collection = () => client.collection('payment_records');

  return {
    async findByOutTradeNo(outTradeNo) {
      assertString(outTradeNo, 'outTradeNo');
      const result = await collection().where({ out_trade_no: outTradeNo }).limit(1).get();
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

    async save(payment) {
      if (!payment || typeof payment !== 'object') {
        throw new TypeError('Payment.save(payment) 需要物件');
      }
      assertString(payment.paymentId, 'paymentId');
      assertString(payment.orderId, 'orderId');
      assertString(payment.outTradeNo, 'outTradeNo');
      await collection().doc(payment.paymentId).set({ data: toRow(payment) });
    },
  };
}

function assertString(value, name) {
  if (typeof value !== 'string' || value.length === 0) {
    throw new TypeError(`${name} 必須是非空字串`);
  }
}

module.exports = { createCloudDBPaymentRepository };
