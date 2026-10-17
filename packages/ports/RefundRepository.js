'use strict';

/**
 * RefundRepository —— 退款紀錄的持久化契約。
 *
 * ```js
 * {
 *   refundId, orderId, outRefundNo, amountCents, currency,
 *   status, reason, requestedBy, requestedAt, processedAt, createdAt,
 * }
 * ```
 *
 * 唯一鍵：`outRefundNo`。
 *
 * 實作：CloudDBRefundRepository、InMemoryRefundRepository
 */
const RefundRepository = Object.freeze({
  name: 'RefundRepository',
  methods: Object.freeze(['findById', 'findByOutRefundNo', 'listByOrderId', 'save']),
  contract: Object.freeze({
    findById: '(refundId: string): Promise<RefundRecord|null>',
    findByOutRefundNo: '(outRefundNo: string): Promise<RefundRecord|null>',
    listByOrderId: '(orderId: string): Promise<RefundRecord[]>',
    save: '(refund: RefundRecord): Promise<void>',
  }),
});

module.exports = { RefundRepository };
