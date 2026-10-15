'use strict';

/**
 * Money —— 金額值物件。
 *
 * 鐵律：
 *  1. 內部一律以「整數分」儲存，永不使用浮點。
 *  2. 不可變（immutable），所有運算回傳新的 Money。
 *  3. 不使用 Date.now() / Math.random()（本檔為純函式，符合 domain 禁令）。
 *
 * 對應 docs/01-目標架構.md §3.1。
 */

/** 取整模式 */
const Rounding = Object.freeze({
  /** 無條件捨去（分潤預設，差額歸平台） */
  FLOOR_TO_CENT: 'FLOOR_TO_CENT',
  /** 四捨五入 */
  ROUND_HALF_UP: 'ROUND_HALF_UP',
  /** 無條件進位 */
  CEIL_TO_CENT: 'CEIL_TO_CENT',
});

const BP_DENOMINATOR = 10000; // basis point：10000 bp = 100%

class Money {
  #cents;

  constructor(cents) {
    if (!Number.isInteger(cents)) {
      throw new TypeError(`Money 只接受整數分，收到：${JSON.stringify(cents)}`);
    }
    if (!Number.isSafeInteger(cents)) {
      throw new RangeError(`Money 超出安全整數範圍：${cents}`);
    }
    this.#cents = cents;
    Object.freeze(this);
  }

  // ── 建構子 ──

  static fromCents(cents) {
    return new Money(cents);
  }

  static fromYuan(yuan) {
    // 只在邊界（例如表單輸入）使用；內部運算一律走分
    const n = Number(yuan);
    if (!Number.isFinite(n)) throw new TypeError(`無效的元金額：${yuan}`);
    return new Money(Math.round(n * 100));
  }

  static zero() {
    return new Money(0);
  }

  // ── 取值 ──

  get cents() {
    return this.#cents;
  }

  /** 僅供顯示。運算請用 cents。 */
  toYuanString() {
    const sign = this.#cents < 0 ? '-' : '';
    const abs = Math.abs(this.#cents);
    return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
  }

  // ── 運算（皆回傳新物件） ──

  add(other) {
    return new Money(this.#cents + Money.#assert(other).#cents);
  }

  subtract(other) {
    return new Money(this.#cents - Money.#assert(other).#cents);
  }

  /** 乘上一個整數數量（例如數量、次數） */
  multiply(quantity) {
    if (!Number.isInteger(quantity)) {
      throw new TypeError(`乘數必須是整數，收到：${JSON.stringify(quantity)}`);
    }
    return new Money(this.#cents * quantity);
  }

  /**
   * 依 basis point 取比例。分潤計算的唯一入口。
   * @param {number} bp 萬分比，例如 8000 = 80.00%
   * @param {string} rounding Rounding 之一
   */
  applyRate(bp, rounding = Rounding.FLOOR_TO_CENT) {
    if (!Number.isInteger(bp)) {
      throw new TypeError(`比例必須是整數 basis point，收到：${JSON.stringify(bp)}`);
    }
    if (bp < 0 || bp > BP_DENOMINATOR) {
      throw new RangeError(`比例必須介於 0 與 ${BP_DENOMINATOR} 之間，收到：${bp}`);
    }
    const numerator = this.#cents * bp;
    return new Money(divideWithRounding(numerator, BP_DENOMINATOR, rounding));
  }

  // ── 比較 ──

  equals(other) {
    return this.#cents === Money.#assert(other).#cents;
  }

  isZero() {
    return this.#cents === 0;
  }

  isNegative() {
    return this.#cents < 0;
  }

  isPositive() {
    return this.#cents > 0;
  }

  isGreaterThan(other) {
    return this.#cents > Money.#assert(other).#cents;
  }

  isGreaterThanOrEqual(other) {
    return this.#cents >= Money.#assert(other).#cents;
  }

  isLessThan(other) {
    return this.#cents < Money.#assert(other).#cents;
  }

  toString() {
    return `Money(${this.#cents}分)`;
  }

  static #assert(value) {
    if (!(value instanceof Money)) {
      throw new TypeError(`預期 Money，收到：${value === null ? 'null' : typeof value}`);
    }
    return value;
  }
}

/**
 * 整數除法 + 取整。獨立成函式以便單獨測試邊界。
 * 注意：JS 的 `/` 會產生浮點，故使用 Math.floor 前先處理負數方向。
 */
function divideWithRounding(numerator, denominator, rounding) {
  const q = numerator / denominator;
  switch (rounding) {
    case Rounding.FLOOR_TO_CENT:
      return Math.floor(q);
    case Rounding.CEIL_TO_CENT:
      return Math.ceil(q);
    case Rounding.ROUND_HALF_UP:
      return Math.sign(q) * Math.round(Math.abs(q));
    default:
      throw new TypeError(`未知的取整模式：${rounding}`);
  }
}

module.exports = { Money, Rounding };
