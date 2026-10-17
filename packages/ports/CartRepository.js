'use strict';

/**
 * CartRepository —— 後端購物車的持久化契約（P7b 起用）。
 *
 * 一個客戶一份（`userId` 唯一）；items 內嵌。
 *
 * ```js
 * {
 *   userId,
 *   items: [{
 *     lineId, productId, skuId, quantity,
 *     addedPriceCents, currency, addedAt,
 *   }],
 *   updatedAt,
 * }
 * ```
 *
 * 實作：CloudDBCartRepository、InMemoryCartRepository
 */
const CartRepository = Object.freeze({
  name: 'CartRepository',
  methods: Object.freeze(['findByUserId', 'save', 'clearByUserId']),
  contract: Object.freeze({
    findByUserId: '(userId: string): Promise<CartRecord|null>',
    save: '(cart: CartRecord): Promise<void>',
    clearByUserId: '(userId: string): Promise<void>',
  }),
});

module.exports = { CartRepository };
