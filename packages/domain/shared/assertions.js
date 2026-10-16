'use strict';

const { InvariantViolation } = require('@repair/shared-kernel/Errors');

/**
 * 領域斷言工具。
 *
 * 為什麼要有這一層：值物件與聚合需要大量前置條件檢查。
 * 若每處都寫 `if (!cond) throw new InvariantViolation(...)`，程式碼會被雜訊淹沒。
 *
 * ⚠️ 這些斷言代表**程式錯誤**（呼叫端用錯 API），不是業務失敗。
 *    業務失敗請回傳 `Result.fail()`。
 */

/**
 * @param {boolean} condition
 * @param {string} message
 * @param {object} [details]
 */
function invariant(condition, message, details) {
  if (!condition) {
    throw new InvariantViolation(message, { details: details || null });
  }
}

function assertNonEmptyString(value, name) {
  invariant(
    typeof value === 'string' && value.trim().length > 0,
    `${name} 必須是非空字串`,
    { name, received: describe(value) },
  );
  return value;
}

function assertInteger(value, name, { min, max } = {}) {
  invariant(Number.isInteger(value), `${name} 必須是整數`, { name, received: describe(value) });
  if (min !== undefined) {
    invariant(value >= min, `${name} 不得小於 ${min}`, { name, value, min });
  }
  if (max !== undefined) {
    invariant(value <= max, `${name} 不得大於 ${max}`, { name, value, max });
  }
  return value;
}

function assertOneOf(value, allowed, name) {
  invariant(
    allowed.includes(value),
    `${name} 必須是 ${allowed.join(' / ')} 之一`,
    { name, received: describe(value), allowed },
  );
  return value;
}

function assertPlainObject(value, name) {
  invariant(
    value !== null && typeof value === 'object' && !Array.isArray(value),
    `${name} 必須是物件`,
    { name, received: describe(value) },
  );
  return value;
}

function assertArray(value, name) {
  invariant(Array.isArray(value), `${name} 必須是陣列`, { name, received: describe(value) });
  return value;
}

/** 供錯誤訊息使用：不洩漏完整內容，只描述型別／形狀 */
function describe(value) {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  if (Array.isArray(value)) return `array(${value.length})`;
  if (typeof value === 'string') return value.length > 40 ? `string(長度 ${value.length})` : JSON.stringify(value);
  return typeof value;
}

module.exports = {
  invariant,
  assertNonEmptyString,
  assertInteger,
  assertOneOf,
  assertPlainObject,
  assertArray,
  describe,
};
