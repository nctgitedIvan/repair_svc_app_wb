'use strict';

/**
 * InMemoryIdSequenceRepository —— IdSequenceRepository 的測試替身。
 *
 * JS 單執行緒下，`next()` 的同步區段是原子的，因此併發呼叫不會拿到重複值。
 * 真實 adapter 必須用資料庫的原子遞增或事務達到同樣效果。
 */
class InMemoryIdSequenceRepository {
  #counters = new Map();

  async next(key) {
    if (typeof key !== 'string' || key.length === 0) {
      throw new TypeError('IdSequence.next(key) 需要非空字串');
    }
    const current = this.#counters.get(key) || 0;
    const nextValue = current + 1;
    this.#counters.set(key, nextValue);
    return nextValue;
  }

  /** 測試輔助 */
  peek(key) {
    return this.#counters.get(key) || 0;
  }
}

module.exports = { InMemoryIdSequenceRepository };
