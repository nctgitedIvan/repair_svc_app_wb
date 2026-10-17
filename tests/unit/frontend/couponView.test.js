'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const couponView = require('../../../utils/couponView');

const NOW = 1_700_000_000_000;
const DAY = 86_400_000;

function coupon(over = {}) {
  return {
    userCouponId: 'uc-1',
    couponId: 'coupon-1',
    name: '新客立減',
    amountCents: 2000,
    minSpendCents: 5000,
    validFrom: NOW - DAY,
    validTo: NOW + DAY,
    status: 'unused',
    ...over,
  };
}

test('formatYuan', async (t) => {
  await t.test('整數元不顯示 .00', () => {
    assert.equal(couponView.formatYuan(2000), '20');
    assert.equal(couponView.formatYuan(1550), '15.50');
    assert.equal(couponView.formatYuan(0), '0');
  });
});

test('unusableReason', async (t) => {
  await t.test('可用 → null', () => {
    assert.equal(couponView.unusableReason(coupon(), 5000, NOW), null);
  });

  await t.test('已使用／已過期狀態', () => {
    assert.equal(couponView.unusableReason(coupon({ status: 'used' }), 5000, NOW), 'COUPON_USED');
    assert.equal(couponView.unusableReason(coupon({ status: 'expired' }), 5000, NOW), 'COUPON_EXPIRED');
  });

  await t.test('有效期邊界', () => {
    assert.equal(
      couponView.unusableReason(coupon({ validFrom: NOW + DAY }), 5000, NOW),
      'COUPON_NOT_STARTED',
    );
    assert.equal(
      couponView.unusableReason(coupon({ validFrom: NOW - 2 * DAY, validTo: NOW - DAY }), 5000, NOW),
      'COUPON_EXPIRED',
    );
  });

  await t.test('未達門檻', () => {
    assert.equal(couponView.unusableReason(coupon(), 4999, NOW), 'BELOW_THRESHOLD');
  });

  await t.test('面額不正確', () => {
    assert.equal(couponView.unusableReason(coupon({ amountCents: 0 }), 5000, NOW), 'INVALID_COUPON');
  });
});

test('discountFor：封頂', () => {
  assert.equal(couponView.discountFor(coupon(), 5000, NOW), 2000);
  assert.equal(couponView.discountFor(coupon({ minSpendCents: 0 }), 1200, NOW), 1200);
  assert.equal(couponView.discountFor(coupon(), 1000, NOW), 0);
});

test('decorate／decorateList', async (t) => {
  await t.test('顯示欄位', () => {
    const row = couponView.decorate(coupon(), 10000, NOW, (ms) => `D${ms}`);
    assert.equal(row.amountText, '20');
    assert.equal(row.thresholdText, '滿 50 可用');
    assert.equal(row.usable, true);
    assert.equal(row.disabled, false);
    assert.equal(row.validText, `D${coupon().validFrom} - D${coupon().validTo}`);
  });

  await t.test('不可用時有原因文字', () => {
    const row = couponView.decorate(coupon(), 1000, NOW);
    assert.equal(row.disabled, true);
    assert.equal(row.reasonText, '未達使用門檻');
  });

  await t.test('可用券排在前面', () => {
    const list = couponView.decorateList(
      [coupon({ userCouponId: 'low', minSpendCents: 99999 }), coupon({ userCouponId: 'ok' })],
      5000,
      NOW,
    );
    assert.equal(list[0].userCouponId, 'ok');
  });
});
