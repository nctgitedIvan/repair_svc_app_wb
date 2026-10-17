'use strict';

/**
 * ProfitSharingRepository —— 分帳與分帳回退紀錄的持久化契約。
 *
 * 分帳：
 * ```js
 * {
 *   sharingId, orderId, outOrderNo, technicianId,
 *   amountCents, currency, status, providerId, createdAt, updatedAt,
 * }
 * ```
 * 唯一鍵：`outOrderNo`。
 *
 * 回退：
 * ```js
 * { returnId, orderId, outOrderNo, amountCents, currency, status, createdAt }
 * ```
 *
 * 實作：CloudDBProfitSharingRepository、InMemoryProfitSharingRepository
 */
const ProfitSharingRepository = Object.freeze({
  name: 'ProfitSharingRepository',
  methods: Object.freeze(['findByOutOrderNo', 'listByOrderId', 'save', 'saveReturn', 'listReturnsByOrderId']),
  contract: Object.freeze({
    findByOutOrderNo: '(outOrderNo: string): Promise<SharingRecord|null>',
    listByOrderId: '(orderId: string): Promise<SharingRecord[]>',
    save: '(sharing: SharingRecord): Promise<void>',
    saveReturn: '(record: ReturnRecord): Promise<void>',
    listReturnsByOrderId: '(orderId: string): Promise<ReturnRecord[]>',
  }),
});

module.exports = { ProfitSharingRepository };
