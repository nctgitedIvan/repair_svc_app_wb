'use strict';

/**
 * ClockPort —— 時間來源。
 *
 * 為什麼需要它：domain 被禁止使用非確定性的時間來源，否則測試無法重現。
 * 所有需要「現在」的地方，一律由呼叫方（Use Case）經此 Port 取得後**以參數傳入** domain。
 *
 * 實作：SystemClockAdapter（正式）、FixedClockAdapter（測試）
 */
const ClockPort = Object.freeze({
  name: 'ClockPort',
  methods: Object.freeze(['now']),
  contract: Object.freeze({
    /** @returns {number} Unix 毫秒 */
    now: '(): number',
  }),
});

module.exports = { ClockPort };
