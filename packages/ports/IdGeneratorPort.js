'use strict';

/**
 * IdGeneratorPort —— 單號／識別碼產生器。
 *
 * 對外單號（out_trade_no、out_order_no、out_refund_no）必須可預測、可重現、可冪等。
 * 因此禁止在 Use Case 內使用隨機或時間來源。
 *
 * 實作：SnowflakeIdAdapter（正式）、SequenceIdAdapter（測試）
 */
const IdGeneratorPort = Object.freeze({
  name: 'IdGeneratorPort',
  methods: Object.freeze(['nextOrderNo', 'nextOutTradeNo', 'nextOutRefundNo']),
  contract: Object.freeze({
    /** @returns {string} 訂單號 */
    nextOrderNo: '(): string',
    /** @returns {string} 微信支付商戶訂單號 */
    nextOutTradeNo: '(orderNo: string): string',
    /** @returns {string} 微信支付商戶退款單號（每筆退款必須不同） */
    nextOutRefundNo: '(orderNo: string, seq: number): string',
  }),
});

module.exports = { IdGeneratorPort };
