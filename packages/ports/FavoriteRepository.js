'use strict';

/**
 * FavoriteRepository —— 客戶收藏的持久化契約（P7b 起用）。
 *
 * 唯一鍵：`(customerId, productId)`。
 *
 * ```js
 * { customerId, productId, productSnapshot: { name, image, priceCents }, createdAt }
 * ```
 *
 * 實作：CloudDBFavoriteRepository、InMemoryFavoriteRepository
 */
const FavoriteRepository = Object.freeze({
  name: 'FavoriteRepository',
  methods: Object.freeze(['listByCustomer', 'isFavorite', 'add', 'remove']),
  contract: Object.freeze({
    /** 依 createdAt 由新到舊 */
    listByCustomer: '(customerId: string): Promise<FavoriteRecord[]>',
    isFavorite: '(customerId: string, productId: string): Promise<boolean>',
    /** 重複加入不應產生第二筆（唯一鍵） */
    add: '(favorite: FavoriteRecord): Promise<void>',
    remove: '(customerId: string, productId: string): Promise<void>',
  }),
});

module.exports = { FavoriteRepository };
