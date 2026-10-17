'use strict';

/**
 * OrderItemRepository —— 訂單明細的持久化契約。
 *
 * 明細是**下單當下的價格快照**（OrderItem.toJSON() 的形狀）：
 * `{ itemType, itemRefId, nameSnapshot, specSnapshot, unitPriceCents, currency,
 *    quantity, feeType, commissionRateBpSnapshot }`
 *
 * 明細不可變；本 Port 不做 update／delete，只做「依訂單讀」與「寫入」。
 *
 * 實作：CloudDBOrderItemRepository、InMemoryOrderItemRepository
 */
const OrderItemRepository = Object.freeze({
  name: 'OrderItemRepository',
  methods: Object.freeze(['listByOrderId', 'saveForOrder']),
  contract: Object.freeze({
    listByOrderId: '(orderId: string): Promise<object[]>',
    /** 以陣列順序寫入；重複呼叫應為冪等 */
    saveForOrder: '(orderId: string, items: object[]): Promise<void>',
  }),
});

module.exports = { OrderItemRepository };
