'use strict';

const { ValueObject } = require('./ValueObject');
const { invariant, assertNonEmptyString } = require('./assertions');

/**
 * PhoneNumber —— 支援澳門（853）與大陸（86）的手機號碼值物件。
 *
 * 接受三種輸入：
 * - `853` + 8 位數字（澳門）
 * - `86` + 11 位數字（大陸）
 * - 純 11 位大陸手機（視為 +86）
 *
 * 輸出：
 * - `formatted`：`+853 6612 3456`／`+86 138 1234 5678`
 * - `e164`：`+85366123456`／`+8613812345678`
 *
 * ⚠️ 本物件持有完整號碼；**師傅端只能拿 `MaskedPhone`**（見該檔）。
 */

const COUNTRY_CODE = Object.freeze({
  MACAU: '853',
  MAINLAND: '86',
});

/** 大陸手機：1 開頭、第二位 3-9、共 11 位 */
const CN_MOBILE_RE = /^1[3-9]\d{9}$/;

/** 澳門手機：8 位數字 */
const MO_MOBILE_RE = /^\d{8}$/;

function digitsOnly(input) {
  return String(input).replace(/[\s\-()]/g, '');
}

class PhoneNumber extends ValueObject {
  /**
   * @param {string} input 可含 +、空白、連字號
   * @returns {PhoneNumber}
   */
  static of(input) {
    assertNonEmptyString(input, 'PhoneNumber');

    let raw = digitsOnly(input);
    if (raw.startsWith('+')) raw = raw.slice(1);

    let countryCode;
    let nationalNumber;

    if (raw.startsWith(COUNTRY_CODE.MACAU)) {
      countryCode = COUNTRY_CODE.MACAU;
      nationalNumber = raw.slice(COUNTRY_CODE.MACAU.length);
    } else if (raw.startsWith(COUNTRY_CODE.MAINLAND)) {
      countryCode = COUNTRY_CODE.MAINLAND;
      nationalNumber = raw.slice(COUNTRY_CODE.MAINLAND.length);
    } else {
      countryCode = COUNTRY_CODE.MAINLAND;
      nationalNumber = raw;
    }

    if (countryCode === COUNTRY_CODE.MACAU) {
      invariant(MO_MOBILE_RE.test(nationalNumber), `澳門手機格式不正確：${input}`, {
        countryCode,
        nationalNumber,
      });
    } else {
      invariant(CN_MOBILE_RE.test(nationalNumber), `大陸手機格式不正確：${input}`, {
        countryCode,
        nationalNumber,
      });
    }

    return new PhoneNumber({ countryCode, nationalNumber });
  }

  constructor({ countryCode, nationalNumber }) {
    const formatted =
      countryCode === COUNTRY_CODE.MACAU
        ? `+${countryCode} ${nationalNumber.slice(0, 4)} ${nationalNumber.slice(4)}`
        : `+${countryCode} ${nationalNumber.slice(0, 3)} ${nationalNumber.slice(3, 7)} ${nationalNumber.slice(7)}`;

    super({
      countryCode,
      nationalNumber,
      e164: `+${countryCode}${nationalNumber}`,
      formatted,
    });
  }

  get countryCode() {
    return this.props.countryCode;
  }

  get nationalNumber() {
    return this.props.nationalNumber;
  }

  get e164() {
    return this.props.e164;
  }

  get formatted() {
    return this.props.formatted;
  }

  /** 遮罩後的字串（供 MaskedPhone 使用） */
  get masked() {
    if (this.props.countryCode === COUNTRY_CODE.MACAU) {
      const n = this.props.nationalNumber;
      return `${COUNTRY_CODE.MACAU} ${n.slice(0, 2)}** ****`;
    }
    const n = this.props.nationalNumber;
    return `${n.slice(0, 3)} **** ${n.slice(7)}`;
  }

  toString() {
    return this.formatted;
  }

  toJSON() {
    return {
      countryCode: this.props.countryCode,
      nationalNumber: this.props.nationalNumber,
      e164: this.props.e164,
      formatted: this.props.formatted,
    };
  }
}

module.exports = { PhoneNumber, COUNTRY_CODE, CN_MOBILE_RE, MO_MOBILE_RE };
