'use strict';

/**
 * ProductRepository —— 材料商品目錄的持久化契約。
 *
 * ProductRecord（camelCase，對齊 fake 與 docs/01 §7.4）：
 * ```js
 * {
 *   productId, name, nameEn, description, detailHtml, images: [],
 *   category, categoryId, order, priceCents, stock,
 *   specs: [{ specId, title, values: [] }],
 *   skus: [{ skuId, specValues: [], priceCents, stock, image }],
 *   isActive,
 * }
 * ```
 *
 * 規則：有 `skus` 時商品層 `stock` 不使用；價格以 SKU 為準。
 *
 * 實作：CloudDBProductRepository、InMemoryProductRepository
 */
const ProductRepository = Object.freeze({
  name: 'ProductRepository',
  methods: Object.freeze(['findById', 'listActive', 'save']),
  contract: Object.freeze({
    findById: '(productId: string): Promise<ProductRecord|null>',
    /** 上架中的商品，依 order 升冪、同序依 name。 */
    listActive: '(): Promise<ProductRecord[]>',
    save: '(product: ProductRecord): Promise<void>',
  }),
});

module.exports = { ProductRepository };
