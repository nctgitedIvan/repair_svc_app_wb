'use strict';

/**
 * PaymentRepository —— 支付紀錄的持久化契約。
 *
 * ```js
 * {
 *   paymentId, orderId, outTradeNo, transactionId,
 *   amountCents, currency, status, prepayAt, paidAt, createdAt,
 * }
 * ```
 *
 * 唯一鍵：`outTradeNo`（微信支付回調重複送達的最後防線）。
 *
 * 實作：CloudDBPaymentRepository、InMemoryPaymentRepository
 */
const PaymentRepository = Object.freeze({
  name: 'PaymentRepository',
  methods: Object.freeze(['findByOutTradeNo', 'listByOrderId', 'save']),
  contract: Object.freeze({
    findByOutTradeNo: '(outTradeNo: string): Promise<PaymentRecord|null>',
    listByOrderId: '(orderId: string): Promise<PaymentRecord[]>',
    save: '(payment: PaymentRecord): Promise<void>',
  }),
});

module.exports = { PaymentRepository };
