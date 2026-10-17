'use strict';

/**
 * CategoryRepository —— 兩層分類的持久化契約（T3.6）。
 *
 * CategoryRecord（camelCase）：
 * ```js
 * { categoryId, name, parentId, icon, order, isActive }
 * ```
 *
 * 規則：
 * - `parentId === null` 為一級；否則指向一級分類的 `categoryId`
 * - 只允許兩層
 * - 下架用 `isActive = false`（軟刪除）
 *
 * 實作：CloudDBCategoryRepository（正式）、InMemoryCategoryRepository（測試）
 */
const CategoryRepository = Object.freeze({
  name: 'CategoryRepository',
  methods: Object.freeze(['list', 'findById', 'save']),
  contract: Object.freeze({
    /**
     * 全部分類（含下架），依 `order` 升冪、同序依 `name`。
     * @returns {Promise<object[]>}
     */
    list: '(): Promise<CategoryRecord[]>',

    /** @returns {Promise<object|null>} */
    findById: '(categoryId: string): Promise<CategoryRecord|null>',

    /** 新增或覆蓋（以 `categoryId` 為鍵）。 */
    save: '(category: CategoryRecord): Promise<void>',
  }),
});

module.exports = { CategoryRepository };
