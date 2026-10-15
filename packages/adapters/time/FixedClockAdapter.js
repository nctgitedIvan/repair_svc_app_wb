'use strict';

/**
 * FixedClockAdapter —— 測試用的可控時鐘。
 *
 * 沒有它，「服務當日 08:00 才揭露完整地址」這類規則就無法測試。
 * 這是 §1.7 第 6 項（可用 fake 替換真 adapter）的一部分。
 *
 * 用法：
 *   const clock = new FixedClockAdapter(1700000000000);
 *   clock.advanceBy(86400000);   // 前進一天
 */
class FixedClockAdapter {
  #now;

  constructor(initialMillis = 0) {
    this.#now = initialMillis;
  }

  now() {
    return this.#now;
  }

  /** 測試輔助：設定絕對時間 */
  setTo(millis) {
    this.#now = millis;
    return this;
  }

  /** 測試輔助：前進 */
  advanceBy(millis) {
    this.#now += millis;
    return this;
  }
}

module.exports = { FixedClockAdapter };
