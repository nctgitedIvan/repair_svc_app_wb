'use strict';

/**
 * OrderQueryPort —— 角色化訂單查詢（P3）。
 *
 * ⚠️ **脫敏在 Port 層完成**（docs/01 §4.7.7）：
 *    Use Case 不得自行過濾欄位；它只能拿到已經依角色投影過的 DTO。
 *
 * DTO 保證：
 * - `customer`：只有自己的訂單；完整地址／電話
 * - `technician`：只有被指派給自己的訂單；電話**永遠遮罩**；地址依 `AddressDisclosurePolicy` 分級
 * - `cs_agent` / `admin`：完整
 * - 非本人／非指派 → `null`（避免以「找不到」區分「存在但不屬於你」）
 *
 * 實作：InMemoryOrderQueryAdapter、CloudDBOrderQueryAdapter
 */
const OrderQueryPort = Object.freeze({
  name: 'OrderQueryPort',
  methods: Object.freeze([
    'findByIdForCustomer',
    'findByIdForTechnician',
    'findByIdForCsAgent',
    'findByIdForAdmin',
  ]),
  contract: Object.freeze({
    findByIdForCustomer: '(actor: object, orderId: string): Promise<OrderView|null>',
    findByIdForTechnician: '(actor: object, orderId: string): Promise<OrderView|null>',
    findByIdForCsAgent: '(actor: object, orderId: string): Promise<OrderView|null>',
    findByIdForAdmin: '(actor: object, orderId: string): Promise<OrderView|null>',
  }),
});

module.exports = { OrderQueryPort };
