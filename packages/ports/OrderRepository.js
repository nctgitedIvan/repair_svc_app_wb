'use strict';

/**
 * OrderRepository —— 訂單聚合的持久化契約。
 *
 * 本檔只描述契約。**實作一律放 packages/adapters**。
 *
 * 實作：CloudDBOrderRepository（正式）、InMemoryOrderRepository（測試）
 */
const OrderRepository = Object.freeze({
  name: 'OrderRepository',
  methods: Object.freeze(['findById', 'findByOrderNo', 'save', 'findExpiredUnpaid', 'findExpiredUnassigned']),
  contract: Object.freeze({
    /**
     * @param {string} orderId
     * @param {{ tx?: object }} [options]
     * @returns {Promise<object|null>} Order 聚合，或 null
     */
    findById: '(orderId: string, options?: { tx?: UnitOfWorkTransaction }): Promise<Order|null>',

    /** @returns {Promise<object|null>} */
    findByOrderNo: '(orderNo: string, options?): Promise<Order|null>',

    /**
     * 樂觀鎖：version 不符時必須拋出，不得靜默覆寫。
     * @returns {Promise<void>}
     */
    save: '(order: Order, options?: { tx?: UnitOfWorkTransaction }): Promise<void>',

    /** 供 AutoExpireUnpaidOrders 定時任務使用 */
    findExpiredUnpaid: '(beforeTimestamp: number, limit: number): Promise<Order[]>',

    /** 供 AutoExpireUnassignedOrders 定時任務使用 */
    findExpiredUnassigned: '(beforeTimestamp: number, limit: number): Promise<Order[]>',
  }),
});

module.exports = { OrderRepository };
