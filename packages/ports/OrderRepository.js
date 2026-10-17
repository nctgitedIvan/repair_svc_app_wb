'use strict';

/**
 * OrderRepository —— 訂單聚合的持久化契約。
 *
 * 本檔只描述契約。**實作一律放 packages/adapters**。
 *
 * ⚠️ P4b 起，本契約對齊**真實的 `Order` 聚合**（`packages/domain/order/Order.js`），
 *    不再是 P0 為了驗證管線而寫的佔位形狀。
 *
 * 實作：CloudDBOrderRepository（P2c）、InMemoryOrderRepository（測試）
 */
const OrderRepository = Object.freeze({
  name: 'OrderRepository',
  methods: Object.freeze(['findById', 'findByOrderNo', 'save', 'findExpiredUnpaid', 'findExpiredUnassigned']),
  contract: Object.freeze({
    /**
     * @param {string} orderId
     * @param {{ tx?: object }} [options]
     * @returns {Promise<import('@repair/domain/order/Order').Order|null>}
     */
    findById: '(orderId: string, options?: { tx?: UnitOfWorkTransaction }): Promise<Order|null>',

    /** @returns {Promise<Order|null>} */
    findByOrderNo: '(orderNo: string, options?): Promise<Order|null>',

    /**
     * 儲存聚合。
     *
     * **樂觀鎖**：優先使用 `options.expectedVersion`（呼叫端載入時的版本）。
     * 未提供時才退回「現存版本必須等於 order.version - 1」。
     * 版本不符時必須拋 `ConcurrencyConflict`，**不得靜默覆寫**。
     *
     * @returns {Promise<void>}
     */
    save: '(order: Order, options?: { tx?: UnitOfWorkTransaction, expectedVersion?: number }): Promise<void>',

    /** 供 AutoExpireUnpaidOrders 定時任務使用 */
    findExpiredUnpaid: '(beforeTimestamp: number, limit: number): Promise<Order[]>',

    /** 供 AutoExpireUnassignedOrders 定時任務使用 */
    findExpiredUnassigned: '(beforeTimestamp: number, limit: number): Promise<Order[]>',
  }),
});

module.exports = { OrderRepository };
