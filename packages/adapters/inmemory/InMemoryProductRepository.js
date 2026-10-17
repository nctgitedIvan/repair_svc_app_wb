'use strict';

/** InMemoryProductRepository —— ProductRepository 的測試替身。 */
class InMemoryProductRepository {
  #products = new Map();

  async findById(productId) {
    assertId(productId, 'productId');
    const product = this.#products.get(productId);
    return product ? clone(product) : null;
  }

  async listActive() {
    return [...this.#products.values()]
      .filter((product) => product.isActive !== false)
      .map(clone)
      .sort(byOrderThenName);
  }

  async save(product) {
    if (!product || typeof product !== 'object') {
      throw new TypeError('Product.save(product) 需要物件');
    }
    assertId(product.productId, 'productId');
    assertName(product.name);

    this.#products.set(product.productId, {
      merchantId: product.merchantId || 'platform',
      productId: product.productId,
      name: product.name,
      nameEn: product.nameEn || '',
      description: product.description || '',
      detailHtml: product.detailHtml || '',
      images: Array.isArray(product.images) ? clone(product.images) : [],
      category: product.category || '',
      categoryId: product.categoryId || '',
      order: Number.isInteger(product.order) ? product.order : 0,
      priceCents: Number.isInteger(product.priceCents) ? product.priceCents : 0,
      stock: Number.isInteger(product.stock) ? product.stock : 0,
      specs: Array.isArray(product.specs) ? clone(product.specs) : [],
      skus: Array.isArray(product.skus) ? clone(product.skus) : [],
      isActive: product.isActive !== false,
    });
  }

  size() {
    return this.#products.size;
  }
}

function byOrderThenName(a, b) {
  const diff = (a.order ?? 0) - (b.order ?? 0);
  return diff !== 0 ? diff : String(a.name).localeCompare(String(b.name));
}

function assertId(value, name) {
  if (typeof value !== 'string' || value.length === 0) {
    throw new TypeError(`${name} 必須是非空字串`);
  }
}

function assertName(value) {
  if (typeof value !== 'string' || value.length === 0) {
    throw new TypeError('Product.name 必須是非空字串');
  }
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

module.exports = { InMemoryProductRepository };
