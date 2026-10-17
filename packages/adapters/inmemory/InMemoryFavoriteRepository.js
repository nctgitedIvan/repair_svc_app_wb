'use strict';

/** InMemoryFavoriteRepository —— FavoriteRepository 的測試替身。 */
class InMemoryFavoriteRepository {
  #favorites = new Map();

  keyOf(customerId, productId) {
    return `${customerId}:${productId}`;
  }

  async listByCustomer(customerId) {
    assertString(customerId, 'customerId');
    return [...this.#favorites.values()]
      .filter((favorite) => favorite.customerId === customerId)
      .map(clone)
      .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  }

  async isFavorite(customerId, productId) {
    assertString(customerId, 'customerId');
    assertString(productId, 'productId');
    return this.#favorites.has(this.keyOf(customerId, productId));
  }

  async add(favorite) {
    if (!favorite || typeof favorite !== 'object') {
      throw new TypeError('Favorite.add(favorite) 需要物件');
    }
    assertString(favorite.customerId, 'customerId');
    assertString(favorite.productId, 'productId');

    const key = this.keyOf(favorite.customerId, favorite.productId);
    if (this.#favorites.has(key)) return;

    this.#favorites.set(key, {
      customerId: favorite.customerId,
      productId: favorite.productId,
      productSnapshot: favorite.productSnapshot
        ? clone(favorite.productSnapshot)
        : { name: '', image: '', priceCents: 0 },
      createdAt: Number.isInteger(favorite.createdAt) ? favorite.createdAt : null,
    });
  }

  async remove(customerId, productId) {
    assertString(customerId, 'customerId');
    assertString(productId, 'productId');
    this.#favorites.delete(this.keyOf(customerId, productId));
  }

  size() {
    return this.#favorites.size;
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

module.exports = { InMemoryFavoriteRepository };
