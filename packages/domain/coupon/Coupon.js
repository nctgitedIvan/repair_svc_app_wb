'use strict';

const { Money } = require('@repair/shared-kernel/Money');
const { invariant, assertNonEmptyString, assertInteger } = require('../shared/assertions');

/**
 * Coupon —— 優惠券（行銷活動的定義）。
 *
 * 這是**券的定義**，不是「某人手上的券」；後者見 `UserCoupon`。
 *
 * 規則：
 * - 面額 `amountCents` > 0；`minSpendCents` >= 0
 * - `validTo` 必須晚於 `validFrom`
 * - 抵扣不可超過訂單小計（`discountFor` 會封頂）
 * - 不在有效期／已停用／未達門檻 → 抵扣 0
 *
 * ⚠️ 本檔為純領域物件：不得使用 `Date.now()`；`now` 一律由呼叫端傳入。
 */
class Coupon {
  #props;

  /**
   * @param {object} props
   * @param {string} props.couponId
   * @param {string} props.name
   * @param {number} props.amountCents       面額（分）
   * @param {number} [props.minSpendCents]   滿減門檻（分），0 = 無門檻
   * @param {number} props.validFrom         生效時間（epoch ms）
   * @param {number} props.validTo           失效時間（epoch ms）
   * @param {boolean} [props.isActive]       是否啟用（預設 true）
   * @param {number|null} [props.totalQuantity] 發行總量；null = 不限
   * @param {number|null} [props.createdAt]
   */
  constructor(props) {
    assertNonEmptyString(props.couponId, 'Coupon.couponId');
    assertNonEmptyString(props.name, 'Coupon.name');
    assertInteger(props.amountCents, 'Coupon.amountCents', { min: 1 });
    assertInteger(props.minSpendCents === undefined ? 0 : props.minSpendCents, 'Coupon.minSpendCents', {
      min: 0,
    });
    assertInteger(props.validFrom, 'Coupon.validFrom', { min: 0 });
    assertInteger(props.validTo, 'Coupon.validTo', { min: 0 });
    invariant(props.validTo > props.validFrom, 'Coupon.validTo 必須晚於 validFrom');

    if (props.totalQuantity !== undefined && props.totalQuantity !== null) {
      assertInteger(props.totalQuantity, 'Coupon.totalQuantity', { min: 0 });
    }
    if (props.createdAt !== undefined && props.createdAt !== null) {
      assertInteger(props.createdAt, 'Coupon.createdAt', { min: 0 });
    }

    this.#props = Object.freeze({
      couponId: props.couponId,
      name: props.name,
      amountCents: props.amountCents,
      minSpendCents: props.minSpendCents === undefined ? 0 : props.minSpendCents,
      validFrom: props.validFrom,
      validTo: props.validTo,
      isActive: props.isActive !== false,
      totalQuantity: props.totalQuantity === undefined ? null : props.totalQuantity,
      createdAt: props.createdAt === undefined ? null : props.createdAt,
    });
  }

  get couponId() { return this.#props.couponId; }
  get name() { return this.#props.name; }
  get amountCents() { return this.#props.amountCents; }
  get minSpendCents() { return this.#props.minSpendCents; }
  get validFrom() { return this.#props.validFrom; }
  get validTo() { return this.#props.validTo; }
  get isActive() { return this.#props.isActive; }
  get totalQuantity() { return this.#props.totalQuantity; }
  get createdAt() { return this.#props.createdAt; }

  /** 面額（Money 值物件；僅供領域內計算與顯示） */
  get amount() {
    return Money.fromCents(this.#props.amountCents);
  }

  /** 目前的時間點是否可使用這張券的**定義** */
  isValidAt(now) {
    assertInteger(now, 'Coupon.isValidAt(now)', { min: 0 });
    return this.#props.isActive && now >= this.#props.validFrom && now <= this.#props.validTo;
  }

  /**
   * 對一個小計可抵扣多少（整數分）。
   *
   * - 券不可用／未達門檻 → 0
   * - 抵扣不可超過小計（避免負數訂單）
   */
  discountFor(subtotalCents, now) {
    assertInteger(subtotalCents, 'Coupon.discountFor(subtotalCents)', { min: 0 });
    if (!this.isValidAt(now)) return 0;
    if (subtotalCents < this.#props.minSpendCents) return 0;
    return Math.min(this.#props.amountCents, subtotalCents);
  }

  toJSON() {
    return {
      couponId: this.#props.couponId,
      name: this.#props.name,
      amountCents: this.#props.amountCents,
      minSpendCents: this.#props.minSpendCents,
      validFrom: this.#props.validFrom,
      validTo: this.#props.validTo,
      isActive: this.#props.isActive,
      totalQuantity: this.#props.totalQuantity,
      createdAt: this.#props.createdAt,
    };
  }

  static rehydrate(row) {
    return new Coupon(row);
  }
}

module.exports = { Coupon };
