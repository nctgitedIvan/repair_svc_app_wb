'use strict';

/** InMemoryCouponRepository —— CouponRepository 的測試替身。 */
class InMemoryCouponRepository {
  #coupons = new Map();

  async findById(couponId) {
    assertString(couponId, 'couponId');
    const coupon = this.#coupons.get(couponId);
    return coupon ? clone(coupon) : null;
  }

  async listAll() {
    return [...this.#coupons.values()]
      .map(clone)
      .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  }

  async save(coupon) {
    if (!coupon || typeof coupon !== 'object') {
      throw new TypeError('Coupon.save(coupon) 需要物件');
    }
    assertString(coupon.couponId, 'couponId');
    assertString(coupon.name, 'name');
    assertInteger(coupon.amountCents, 'amountCents', 1);
    assertInteger(coupon.minSpendCents === undefined ? 0 : coupon.minSpendCents, 'minSpendCents', 0);
    assertInteger(coupon.validFrom, 'validFrom', 0);
    assertInteger(coupon.validTo, 'validTo', 0);
    if (coupon.validTo <= coupon.validFrom) {
      throw new TypeError('validTo 必須晚於 validFrom');
    }

    this.#coupons.set(coupon.couponId, {
      couponId: coupon.couponId,
      name: coupon.name,
      amountCents: coupon.amountCents,
      minSpendCents: coupon.minSpendCents === undefined ? 0 : coupon.minSpendCents,
      validFrom: coupon.validFrom,
      validTo: coupon.validTo,
      isActive: coupon.isActive !== false,
      totalQuantity: Number.isInteger(coupon.totalQuantity) ? coupon.totalQuantity : null,
      createdAt: Number.isInteger(coupon.createdAt) ? coupon.createdAt : null,
    });
  }

  size() {
    return this.#coupons.size;
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

module.exports = { InMemoryCouponRepository };
