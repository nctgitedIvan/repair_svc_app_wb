'use strict';

const STATUSES = ['unused', 'used', 'expired'];

/** InMemoryUserCouponRepository —— UserCouponRepository 的測試替身。 */
class InMemoryUserCouponRepository {
  #userCoupons = new Map();

  async findById(userCouponId) {
    assertString(userCouponId, 'userCouponId');
    const userCoupon = this.#userCoupons.get(userCouponId);
    return userCoupon ? clone(userCoupon) : null;
  }

  async findByUserAndCoupon(userId, couponId) {
    assertString(userId, 'userId');
    assertString(couponId, 'couponId');
    for (const userCoupon of this.#userCoupons.values()) {
      if (userCoupon.userId === userId && userCoupon.couponId === couponId) {
        return clone(userCoupon);
      }
    }
    return null;
  }

  async listByUser(userId) {
    assertString(userId, 'userId');
    return [...this.#userCoupons.values()]
      .filter((userCoupon) => userCoupon.userId === userId)
      .map(clone)
      .sort((a, b) => (b.receivedAt || 0) - (a.receivedAt || 0));
  }

  async listByCoupon(couponId) {
    assertString(couponId, 'couponId');
    return [...this.#userCoupons.values()]
      .filter((userCoupon) => userCoupon.couponId === couponId)
      .map(clone)
      .sort((a, b) => (b.receivedAt || 0) - (a.receivedAt || 0));
  }

  async save(userCoupon) {
    if (!userCoupon || typeof userCoupon !== 'object') {
      throw new TypeError('UserCoupon.save(userCoupon) 需要物件');
    }
    assertString(userCoupon.userCouponId, 'userCouponId');
    assertString(userCoupon.couponId, 'couponId');
    assertString(userCoupon.userId, 'userId');
    assertString(userCoupon.status, 'status');
    if (!STATUSES.includes(userCoupon.status)) {
      throw new TypeError(`status 必須是 ${STATUSES.join(' / ')} 之一`);
    }
    assertInteger(userCoupon.validFrom, 'validFrom', 0);
    assertInteger(userCoupon.validTo, 'validTo', 0);
    assertInteger(userCoupon.receivedAt, 'receivedAt', 0);
    if (userCoupon.validTo <= userCoupon.validFrom) {
      throw new TypeError('validTo 必須晚於 validFrom');
    }

    this.#userCoupons.set(userCoupon.userCouponId, {
      userCouponId: userCoupon.userCouponId,
      couponId: userCoupon.couponId,
      userId: userCoupon.userId,
      status: userCoupon.status,
      validFrom: userCoupon.validFrom,
      validTo: userCoupon.validTo,
      receivedAt: userCoupon.receivedAt,
      usedAt: Number.isInteger(userCoupon.usedAt) ? userCoupon.usedAt : null,
      orderId: userCoupon.orderId || null,
    });
  }

  size() {
    return this.#userCoupons.size;
  }
}

function assertString(value, name) {
  if (typeof value !== 'string' || value.length === 0) {
    throw new TypeError(`${name} 必須是非空字串`);
  }
}

function assertInteger(value, name, min) {
  if (!Number.isInteger(value) || value < min) {
    throw new TypeError(`${name} 必須是不小於 ${min} 的整數`);
  }
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

module.exports = { InMemoryUserCouponRepository };
