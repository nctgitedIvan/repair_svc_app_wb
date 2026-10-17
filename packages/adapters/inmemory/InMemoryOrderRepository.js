'use strict';

const { ConcurrencyConflict } = require('@repair/shared-kernel/Errors');

/**
 * InMemoryOrderRepository —— 測試替身（Fake）。
 *
 * 契約見 `packages/ports/OrderRepository.js`（P4b 起對齊 `Order` 聚合）。
 *
 * 內部儲存的是 `order.toPersistence()` 的**純資料**，
 * `findById` 再用 `Order.rehydrate()` 還原 —— 這與真實 adapter 的行為一致
 * （真實 adapter 也是「存 row、讀 row 還原」），因此用它測過的邏輯在真實 DB 上同樣成立。
 *
 * P2c 會寫「契約測試」：同一套斷言同時跑本檔與 `CloudDBOrderRepository`。
 */
class InMemoryOrderRepository {
  #rows = new Map();

  /** 測試輔助：預先放入聚合或持久化資料 */
  seed(orders) {
    for (const order of orders) {
      const row = typeof order.toPersistence === 'function' ? order.toPersistence() : order;
      this.#rows.set(row.orderId, JSON.parse(JSON.stringify(row)));
    }
    return this;
  }

  async findById(orderId) {
    const row = this.#rows.get(orderId);
    if (!row) return null;
    return this.#toDomain(row);
  }

  async findByOrderNo(orderNo) {
    for (const row of this.#rows.values()) {
      if (row.orderNo === orderNo) return this.#toDomain(row);
    }
    return null;
  }

  async save(order) {
    const existing = this.#rows.get(order.id);
    const row = order.toPersistence();

    // 樂觀鎖：存檔的 version 必須是「現存版本 + 1」
    if (existing && existing.version !== order.version - 1) {
      throw new ConcurrencyConflict('orders', order.version, existing.version);
    }

    this.#rows.set(order.id, JSON.parse(JSON.stringify(row)));
  }

  async findExpiredUnpaid(beforeTimestamp, limit) {
    return [...this.#rows.values()]
      .filter((r) => r.statusValue === 10 && r.createdAt < beforeTimestamp)
      .slice(0, limit)
      .map((r) => this.#toDomain(r));
  }

  async findExpiredUnassigned(beforeTimestamp, limit) {
    return [...this.#rows.values()]
      .filter((r) => [20, 30].includes(r.statusValue) && r.createdAt < beforeTimestamp)
      .slice(0, limit)
      .map((r) => this.#toDomain(r));
  }

  /** 測試輔助 */
  size() {
    return this.#rows.size;
  }

  /** 測試輔助：取得原始 row（斷言持久化形狀用） */
  rawRow(orderId) {
    const row = this.#rows.get(orderId);
    return row ? JSON.parse(JSON.stringify(row)) : null;
  }

  #toDomain(row) {
    // 延遲 require 避免循環：adapters 依賴 domain，但不需要在載入期就解析
    const { Order } = require('@repair/domain/order/Order');
    return Order.rehydrate(row);
  }
}

module.exports = { InMemoryOrderRepository };
