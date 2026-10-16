'use strict';

/**
 * Money —— 金額值物件。
 *
 * 鐵律：
 *  1. 內部一律以「整數分」儲存，永不使用浮點。
 *  2. 不可變（immutable），所有運算回傳新的 Money。
 *  3. **幣別必須相同才能運算** —— 跨幣別相加是程式錯誤，必須當場爆。
 *  4. 不使用 Date.now() / Math.random()（本檔為純函式）。
 *
 * 對應 docs/01-目標架構.md §3.1、§12.B-1。
 */

/** 預設幣別。向後相容：既有 `Money.fromCents(100)` 不需修改。 */
const DEFAULT_CURRENCY = 'CNY';

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
  #currency;

  constructor(cents, currency = DEFAULT_CURRENCY) {
    if (!Number.isInteger(cents)) {
      throw new TypeError(`Money 只接受整數分，收到：${JSON.stringify(cents)}`);
    }
    if (!Number.isSafeInteger(cents)) {
      throw new RangeError(`Money 超出安全整數範圍：${cents}`);
    }
    if (typeof currency !== 'string' || currency.length !== 3) {
      // 只接受 ISO 4217 的三碼格式。不驗證是否為真實幣別 ——
      // 那是外部知識，值物件不該內建一張幣別表。
      throw new TypeError(`幣別必須是三個字母的代碼，收到：${JSON.stringify(currency)}`);
    }
    this.#cents = cents;
    this.#currency = currency.toUpperCase();
    Object.freeze(this);
  }

  // ── 建構子 ──

  static fromCents(cents, currency = DEFAULT_CURRENCY) {
    return new Money(cents, currency);
  }

  static fromYuan(yuan, currency = DEFAULT_CURRENCY) {
    // 只在邊界（例如表單輸入）使用；內部運算一律走分
    const n = Number(yuan);
    if (!Number.isFinite(n)) throw new TypeError(`無效的元金額：${yuan}`);
    return new Money(Math.round(n * 100), currency);
  }

  static zero(currency = DEFAULT_CURRENCY) {
    return new Money(0, currency);
  }

  // ── 取值 ──

  get cents() {
    return this.#cents;
  }

  get currency() {
    return this.#currency;
  }

  /** 僅供顯示。運算請用 cents。 */
  toYuanString() {
    const sign = this.#cents < 0 ? '-' : '';
    const abs = Math.abs(this.#cents);
    return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
  }

  // ── 運算（皆回傳新物件，且保留幣別） ──

  add(other) {
    const o = Money.#assertCompatible(this, other);
    return new Money(this.#cents + o.#cents, this.#currency);
  }

  subtract(other) {
    const o = Money.#assertCompatible(this, other);
    return new Money(this.#cents - o.#cents, this.#currency);
  }

  /** 乘上一個整數數量（例如數量、次數）。幣別不變。 */
  multiply(quantity) {
    if (!Number.isInteger(quantity)) {
      throw new TypeError(`乘數必須是整數，收到：${JSON.stringify(quantity)}`);
    }
    return new Money(this.#cents * quantity, this.#currency);
  }

  /**
   * 依 basis point 取比例。分潤計算的唯一入口。幣別不變。
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
    return new Money(divideWithRounding(numerator, BP_DENOMINATOR, rounding), this.#currency);
  }

  // ── 比較 ──

  /** 幣別不同時**不相等**（即使分的數值相同） */
  equals(other) {
    const o = Money.#assert(other);
    return this.#cents === o.#cents && this.#currency === o.#currency;
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
    return this.#cents > Money.#assertCompatible(this, other).#cents;
  }

  isGreaterThanOrEqual(other) {
    return this.#cents >= Money.#assertCompatible(this, other).#cents;
  }

  isLessThan(other) {
    return this.#cents < Money.#assertCompatible(this, other).#cents;
  }

  toString() {
    return `Money(${this.#cents}分 ${this.#currency})`;
  }

  static #assert(value) {
    if (!(value instanceof Money)) {
      throw new TypeError(`預期 Money，收到：${value === null ? 'null' : typeof value}`);
    }
    return value;
  }

  /**
   * 斷言兩個 Money 可運算：型別正確**且幣別相同**。
   *
   * 為什麼要拋錯而不是自動換算：本系統沒有匯率來源。
   * 靜默地把 CNY 和 USD 相加，會產生一個看起來正常但完全錯誤的數字 ——
   * 這是金流系統最危險的 bug 類型。寧可當場爆。
   */
  static #assertCompatible(self, other) {
    const o = Money.#assert(other);
    if (o.#currency !== self.#currency) {
      throw new RangeError(
        `幣別不符，無法運算：${self.#currency} 與 ${o.#currency}`,
      );
    }
    return o;
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

module.exports = { Money, Rounding, DEFAULT_CURRENCY };
