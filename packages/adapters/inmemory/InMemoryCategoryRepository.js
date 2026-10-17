'use strict';

/**
 * InMemoryCategoryRepository —— CategoryRepository 的測試替身。
 *
 * 行為與 CloudDB 版一致：
 *  - 以 `categoryId` 為鍵 upsert
 *  - `list()` 依 `order` 升冪、同序依 `name`
 *  - 下架用 `isActive = false`（不刪除）
 */
class InMemoryCategoryRepository {
  #categories = new Map();

  async list() {
    return [...this.#categories.values()]
      .map(clone)
      .sort((a, b) => {
        const orderDiff = (a.order ?? 0) - (b.order ?? 0);
        if (orderDiff !== 0) return orderDiff;
        return String(a.name).localeCompare(String(b.name));
      });
  }

  async findById(categoryId) {
    assertId(categoryId);
    const category = this.#categories.get(categoryId);
    return category ? clone(category) : null;
  }

  async save(category) {
    if (!category || typeof category !== 'object') {
      throw new TypeError('Category.save(category) 需要物件');
    }
    assertId(category.categoryId);
    if (typeof category.name !== 'string' || category.name.length === 0) {
      throw new TypeError('Category.name 必須是非空字串');
    }

    this.#categories.set(category.categoryId, {
      categoryId: category.categoryId,
      name: category.name,
      parentId: category.parentId || null,
      icon: typeof category.icon === 'string' ? category.icon : '',
      order: Number.isInteger(category.order) ? category.order : 0,
      isActive: category.isActive !== false,
    });
  }

  /** 測試輔助 */
  size() {
    return this.#categories.size;
  }
}

function assertId(categoryId) {
  if (typeof categoryId !== 'string' || categoryId.length === 0) {
    throw new TypeError('Category.categoryId 必須是非空字串');
  }
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

module.exports = { InMemoryCategoryRepository };
