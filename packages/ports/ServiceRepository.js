'use strict';

/**
 * ServiceRepository —— 服務目錄的持久化契約。
 *
 * ServiceRecord（camelCase，對齊 fake 與 docs/01 §7.4）：
 * ```js
 * {
 *   merchantId, // 多租戶預留；目前皆為 'platform'
 *   serviceId, name, nameEn, description, detailHtml, images: [],
 *   category, categoryId, order, priceCents,
 *   durationMinutes, skillTags: [], isActive,
 * }
 * ```
 *
 * 實作：CloudDBServiceRepository、InMemoryServiceRepository
 */
const ServiceRepository = Object.freeze({
  name: 'ServiceRepository',
  methods: Object.freeze(['findById', 'listActive', 'save']),
  contract: Object.freeze({
    findById: '(serviceId: string): Promise<ServiceRecord|null>',
    /** 上架中的服務，依 order 升冪、同序依 name。 */
    listActive: '(): Promise<ServiceRecord[]>',
    save: '(service: ServiceRecord): Promise<void>',
  }),
});

module.exports = { ServiceRepository };
