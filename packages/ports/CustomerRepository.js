'use strict';

/**
 * CustomerRepository —— 客戶檔案的持久化契約。
 *
 * CustomerRecord（camelCase）：
 * ```js
 * {
 *   customerId, userId, name, phone,
 *   addresses: [{ addressId, name, phone, province, city, district, detailAddress, isDefault }],
 *   defaultAddressId, createdAt, updatedAt,
 * }
 * ```
 *
 * 實作：CloudDBCustomerRepository、InMemoryCustomerRepository
 */
const CustomerRepository = Object.freeze({
  name: 'CustomerRepository',
  methods: Object.freeze(['findById', 'findByUserId', 'save']),
  contract: Object.freeze({
    findById: '(customerId: string): Promise<CustomerRecord|null>',
    findByUserId: '(userId: string): Promise<CustomerRecord|null>',
    save: '(customer: CustomerRecord): Promise<void>',
  }),
});

module.exports = { CustomerRepository };
