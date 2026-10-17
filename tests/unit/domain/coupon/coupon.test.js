'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { Coupon } = require('../../../../packages/domain/coupon/Coupon');
const {
  UserCoupon,
  UserCouponStatus,
} = require('../../../../packages/domain/coupon/UserCoupon');
const { InMemoryCouponRepository } = require('../../../../packages/adapters/inmemory/InMemoryCouponRepository');
const { InMemoryUserCouponRepository } = require('../../../../packages/adapters/inmemory/InMemoryUserCouponRepository');

const NOW = 1_700_000_000_000;
const DAY = 86_400_000;

function coupon(over = {}) {
  return new Coupon({
    couponId: 'coupon-1',
    name: '新客立減',
    amountCents: 2000,
    minSpendCents: 5000,
    validFrom: NOW - DAY,
    validTo: NOW + 30 * DAY,
    ...over,
  });
}

function userCoupon(over = {}) {
  return new UserCoupon({
    userCouponId: 'uc-1',
    couponId: 'coupon-1',
    userId: 'u-1',
    status: UserCouponStatus.UNUSED,
    validFrom: NOW - DAY,
    validTo: NOW + 30 * DAY,
    receivedAt: NOW - DAY,
    ...over,
  });
}

test('Coupon：形狀與有效期', async (t) => {
  await t.test('合法建立', () => {
    const c = coupon();
    assert.equal(c.couponId, 'coupon-1');
    assert.equal(c.amount.cents, 2000);
    assert.equal(c.isValidAt(NOW), true);
  });

  await t.test('面額必須 > 0', () => {
    assert.throws(() => coupon({ amountCents: 0 }), /amountCents/);
  });

  await t.test('validTo 必須晚於 validFrom', () => {
    assert.throws(() => coupon({ validFrom: NOW, validTo: NOW }), /validTo/);
  });

  await t.test('停用／未生效／已過期都不可用', () => {
    assert.equal(coupon({ isActive: false }).isValidAt(NOW), false);
    assert.equal(coupon({ validFrom: NOW + DAY }).isValidAt(NOW), false);
    assert.equal(coupon({ validFrom: NOW - 2 * DAY, validTo: NOW - DAY }).isValidAt(NOW), false);
  });
});

test('Coupon：抵扣計算', async (t) => {
  await t.test('未達門檻 → 0', () => {
    assert.equal(coupon().discountFor(4999, NOW), 0);
  });

  await t.test('達門檻 → 面額', () => {
    assert.equal(coupon().discountFor(5000, NOW), 2000);
  });

  await t.test('抵扣不可超過小計（避免負數）', () => {
    assert.equal(coupon({ minSpendCents: 0 }).discountFor(500, NOW), 500);
  });

  await t.test('不可用時 → 0', () => {
    assert.equal(coupon({ isActive: false }).discountFor(10000, NOW), 0);
  });
});

test('UserCoupon：狀態流轉', async (t) => {
  await t.test('未使用且有效期內 → 可用', () => {
    assert.equal(userCoupon().isUsableAt(NOW), true);
  });

  await t.test('使用後不可再用，且記錄訂單', () => {
    const uc = userCoupon();
    uc.use({ at: NOW, orderId: 'order-1' });
    assert.equal(uc.status, UserCouponStatus.USED);
    assert.equal(uc.usedAt, NOW);
    assert.equal(uc.orderId, 'order-1');
    assert.equal(uc.isUsableAt(NOW + 1), false);
    assert.throws(() => uc.use({ at: NOW + 1, orderId: 'order-2' }), /不可使用/);
  });

  await t.test('過期後不可用；標記 expired 後狀態正確', () => {
    const uc = userCoupon();
    const after = NOW + 31 * DAY;
    assert.equal(uc.isExpiredAt(after), true);
    assert.equal(uc.isUsableAt(after), false);
    uc.expire(after);
    assert.equal(uc.status, UserCouponStatus.EXPIRED);
  });

  await t.test('尚未到期不可標記 expired', () => {
    assert.throws(() => userCoupon().expire(NOW), /尚未到期/);
  });
});

test('InMemoryCouponRepository / InMemoryUserCouponRepository', async (t) => {
  await t.test('Coupon：upsert 與 listAll（新到舊）', async () => {
    const repo = new InMemoryCouponRepository();
    await repo.save(coupon({ couponId: 'c-old', createdAt: 1 }));
    await repo.save(coupon({ couponId: 'c-new', createdAt: 2 }));

    const list = await repo.listAll();
    assert.deepEqual(list.map((c) => c.couponId), ['c-new', 'c-old']);
    assert.equal('toJSON' in (await repo.findById('c-old')), false, 'repo 回傳純資料');
  });

  await t.test('UserCoupon：依使用者查詢、以 userCouponId upsert', async () => {
    const repo = new InMemoryUserCouponRepository();
    await repo.save(userCoupon());
    await repo.save(userCoupon({ userCouponId: 'uc-2', couponId: 'coupon-2', receivedAt: NOW }));

    const list = await repo.listByUser('u-1');
    assert.equal(list.length, 2);
    assert.equal(list[0].userCouponId, 'uc-2', '新到舊');

    const found = await repo.findByUserAndCoupon('u-1', 'coupon-1');
    assert.equal(found.userCouponId, 'uc-1');

    found.status = 'used';
    await repo.save(found);
    assert.equal((await repo.findById('uc-1')).status, 'used');
    assert.equal((await repo.listByCoupon('coupon-1')).length >= 1, true);
  });

  await t.test('無效狀態被拒絕（repo 層也守）', async () => {
    const repo = new InMemoryUserCouponRepository();
    await assert.rejects(
      () =>
        repo.save({
          userCouponId: 'uc-x',
          couponId: 'coupon-1',
          userId: 'u-1',
          status: 'weird',
          validFrom: NOW - DAY,
          validTo: NOW + DAY,
          receivedAt: NOW,
        }),
      /status/,
    );
  });
});
