'use strict';

const { invariant, assertNonEmptyString, assertInteger, assertOneOf } = require('../shared/assertions');

const UserCouponStatus = Object.freeze({
  UNUSED: 'unused',
  USED: 'used',
  EXPIRED: 'expired',
});

const USER_COUPON_STATUSES = Object.freeze(Object.values(UserCouponStatus));

/**
 * UserCoupon —— 使用者持有的一張優惠券。
 *
 * 與 `Coupon`（券的定義）分離：發放時把**有效期快照**複製進來，
 * 之後後台修改券的定義不影響已發出的券（與訂單價格快照同一個原則）。
 *
 * 狀態：
 *   unused → used（下單使用）
 *   unused → expired（到期）
 *
 * ⚠️ `now` 一律由呼叫端傳入，本檔不使用 `Date.now()`。
 */
class UserCoupon {
  #props;

  /**
   * @param {object} props
   * @param {string} props.userCouponId
   * @param {string} props.couponId
   * @param {string} props.userId
   * @param {string} [props.status]      unused／used／expired
   * @param {number} props.validFrom
   * @param {number} props.validTo
   * @param {number} props.receivedAt
   * @param {number|null} [props.usedAt]
   * @param {string|null} [props.orderId]
   */
  constructor(props) {
    assertNonEmptyString(props.userCouponId, 'UserCoupon.userCouponId');
    assertNonEmptyString(props.couponId, 'UserCoupon.couponId');
    assertNonEmptyString(props.userId, 'UserCoupon.userId');
    assertOneOf(props.status || UserCouponStatus.UNUSED, USER_COUPON_STATUSES, 'UserCoupon.status');
    assertInteger(props.validFrom, 'UserCoupon.validFrom', { min: 0 });
    assertInteger(props.validTo, 'UserCoupon.validTo', { min: 0 });
    invariant(props.validTo > props.validFrom, 'UserCoupon.validTo 必須晚於 validFrom');
    assertInteger(props.receivedAt, 'UserCoupon.receivedAt', { min: 0 });

    const status = props.status || UserCouponStatus.UNUSED;
    if (status === UserCouponStatus.USED) {
      assertInteger(props.usedAt, 'UserCoupon.usedAt', { min: 0 });
    }

    this.#props = {
      userCouponId: props.userCouponId,
      couponId: props.couponId,
      userId: props.userId,
      status,
      validFrom: props.validFrom,
      validTo: props.validTo,
      receivedAt: props.receivedAt,
      usedAt: Number.isInteger(props.usedAt) ? props.usedAt : null,
      orderId: props.orderId || null,
    };
  }

  get userCouponId() { return this.#props.userCouponId; }
  get couponId() { return this.#props.couponId; }
  get userId() { return this.#props.userId; }
  get status() { return this.#props.status; }
  get validFrom() { return this.#props.validFrom; }
  get validTo() { return this.#props.validTo; }
  get receivedAt() { return this.#props.receivedAt; }
  get usedAt() { return this.#props.usedAt; }
  get orderId() { return this.#props.orderId; }

  isExpiredAt(now) {
    assertInteger(now, 'UserCoupon.isExpiredAt(now)', { min: 0 });
    return now > this.#props.validTo;
  }

  /** 目前是否可用：未使用、在有效期內 */
  isUsableAt(now) {
    assertInteger(now, 'UserCoupon.isUsableAt(now)', { min: 0 });
    return (
      this.#props.status === UserCouponStatus.UNUSED &&
      now >= this.#props.validFrom &&
      !this.isExpiredAt(now)
    );
  }

  /** 標記為已使用（訂單提交時呼叫） */
  use({ at, orderId = null } = {}) {
    invariant(this.isUsableAt(at), 'UserCoupon 目前不可使用');
    this.#props.status = UserCouponStatus.USED;
    this.#props.usedAt = at;
    this.#props.orderId = orderId;
  }

  /** 將已到期的未使用券標記為 expired（定時任務或讀取時呼叫） */
  expire(now) {
    assertInteger(now, 'UserCoupon.expire(now)', { min: 0 });
    invariant(this.#props.status === UserCouponStatus.UNUSED, '只有未使用的券可以標記為過期');
    invariant(this.isExpiredAt(now), '尚未到期的券不可標記為過期');
    this.#props.status = UserCouponStatus.EXPIRED;
  }

  toJSON() {
    return { ...this.#props };
  }

  static rehydrate(row) {
    return new UserCoupon(row);
  }
}

module.exports = { UserCoupon, UserCouponStatus, USER_COUPON_STATUSES };
