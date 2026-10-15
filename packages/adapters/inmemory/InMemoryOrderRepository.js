'use strict';

/**
 * InMemoryOrderRepository —— 測試替身（Fake）。
 *
 * 這不是「次要」的程式碼：它是 §1.7 第 6 項驗收標準的實體，
 * 也是讓 domain 與 application 能在**完全不啟動微信雲環境**下被測試的關鍵。
 *
 * ⚠️ P2 會寫「契約測試」：同一套測試同時跑本檔與 CloudDBOrderRepository，
 *    確保兩者行為一致（否則用 fake 測過的邏輯上線後會壞）。
 *
 * 實作 OrderRepository 契約（packages/ports/OrderRepository.js）。
 */
class InMemoryOrderRepository {
  #orders = new Map();

  /** 測試輔助：預先放入資料 */
  seed(orders) {
    for (const o of orders) {
      this.#orders.set(o.id, JSON.parse(JSON.stringify(o)));
    }
    return this;
  }

  async findById(orderId) {
    const row = this.#orders.get(orderId);
    return row ? JSON.parse(JSON.stringify(row)) : null;
  }

  async findByOrderNo(orderNo) {
    for (const row of this.#orders.values()) {
      if (row.orderNo === orderNo) return JSON.parse(JSON.stringify(row));
    }
    return null;
  }

  async save(order) {
    // 模擬樂觀鎖：與真實 adapter 行為一致
    const existing = this.#orders.get(order.id);
    if (existing && existing.version !== order.version) {
      throw new Error(`樂觀鎖衝突：預期 version ${existing.version}，收到 ${order.version}`);
    }
    const next = JSON.parse(JSON.stringify(order));
    next.version = (existing ? existing.version : 0) + 1;
    this.#orders.set(order.id, next);
  }

  async findExpiredUnpaid(beforeTimestamp, limit) {
    return [...this.#orders.values()]
      .filter((o) => o.statusValue === 10 && o.createdAt < beforeTimestamp)
      .slice(0, limit);
  }

  async findExpiredUnassigned(beforeTimestamp, limit) {
    return [...this.#orders.values()]
      .filter((o) => [20, 30].includes(o.statusValue) && o.createdAt < beforeTimestamp)
      .slice(0, limit);
  }

  /** 測試輔助 */
  size() {
    return this.#orders.size;
  }
}

module.exports = { InMemoryOrderRepository };
