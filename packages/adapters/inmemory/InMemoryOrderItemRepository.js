'use strict';

/** InMemoryOrderItemRepository —— OrderItemRepository 的測試替身。 */
class InMemoryOrderItemRepository {
  #itemsByOrder = new Map();

  async listByOrderId(orderId) {
    assertString(orderId, 'orderId');
    return clone(this.#itemsByOrder.get(orderId) || []);
  }

  async saveForOrder(orderId, items) {
    assertString(orderId, 'orderId');
    if (!Array.isArray(items)) throw new TypeError('items 必須是陣列');
    this.#itemsByOrder.set(orderId, clone(items));
  }

  size() {
    return this.#itemsByOrder.size;
  }
}

function assertString(value, name) {
  if (typeof value !== 'string' || value.length === 0) {
    throw new TypeError(`${name} 必須是非空字串`);
  }
}
function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

module.exports = { InMemoryOrderItemRepository };
