'use strict';

/**
 * SystemClockAdapter —— ClockPort 的正式實作。
 *
 * 這是**唯一**允許呼叫 Date.now() 的地方之一（見 check-layering.js 的 domain 禁令）。
 * 翻譯職責：無。它本身就是時間的邊界。
 */
class SystemClockAdapter {
  now() {
    return Date.now();
  }
}

module.exports = { SystemClockAdapter };
