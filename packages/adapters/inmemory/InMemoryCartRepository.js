'use strict';

/** InMemoryCartRepository —— CartRepository 的測試替身。 */
class InMemoryCartRepository {
  #carts = new Map();

  async findByUserId(userId) {
    assertString(userId, 'userId');
    const cart = this.#carts.get(userId);
    return cart ? clone(cart) : null;
  }

  async save(cart) {
    if (!cart || typeof cart !== 'object') {
      throw new TypeError('Cart.save(cart) 需要物件');
    }
    assertString(cart.userId, 'userId');

    this.#carts.set(cart.userId, {
      userId: cart.userId,
      items: Array.isArray(cart.items) ? clone(cart.items) : [],
      updatedAt: Number.isInteger(cart.updatedAt) ? cart.updatedAt : null,
    });
  }

  async clearByUserId(userId) {
    assertString(userId, 'userId');
    this.#carts.delete(userId);
  }

  size() {
    return this.#carts.size;
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

module.exports = { InMemoryCartRepository };
