'use strict';

/**
 * InMemorySystemConfigRepository —— SystemConfigRepository 的測試替身。
 *
 * 值一律以 JSON 深拷貝存取，避免呼叫端修改回傳物件時污染內部資料。
 */
class InMemorySystemConfigRepository {
  #values = new Map();

  async get(key, defaultValue = null) {
    assertKey(key);
    if (!this.#values.has(key)) return defaultValue;
    return clone(this.#values.get(key));
  }

  async set(key, value) {
    assertKey(key);
    this.#values.set(key, clone(value));
  }

  /** 測試輔助 */
  size() {
    return this.#values.size;
  }
}

function assertKey(key) {
  if (typeof key !== 'string' || key.length === 0) {
    throw new TypeError('SystemConfig key 必須是非空字串');
  }
}

function clone(value) {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value));
}

module.exports = { InMemorySystemConfigRepository };
