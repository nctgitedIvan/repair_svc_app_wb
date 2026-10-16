'use strict';

/**
 * Money 的幣別保護測試（P4a-T1 新增的行為）。
 *
 * 這組測試要證明兩件事：
 *   1. **加了保護** —— 跨幣別運算必須當場爆
 *   2. **沒破壞既有行為** —— 不指定幣別時行為與 P0 完全相同
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const { Money, Rounding, DEFAULT_CURRENCY } = require('../../../packages/shared-kernel/Money');

test('向後相容：不指定幣別時行為與 P0 相同', async (t) => {
  await t.test('預設幣別為 CNY', () => {
    assert.equal(Money.fromCents(100).currency, DEFAULT_CURRENCY);
    assert.equal(Money.fromYuan(1).currency, DEFAULT_CURRENCY);
    assert.equal(Money.zero().currency, DEFAULT_CURRENCY);
  });

  await t.test('既有運算不受影響', () => {
    assert.equal(Money.fromCents(10000).add(Money.fromCents(500)).cents, 10500);
    assert.equal(Money.fromCents(10000).subtract(Money.fromCents(500)).cents, 9500);
    assert.equal(Money.fromCents(10000).applyRate(8000).cents, 8000);
    assert.equal(Money.fromCents(10000).toYuanString(), '100.00');
  });
});

test('跨幣別運算必須當場爆（不得靜默產生錯誤數字）', async (t) => {
  const cny = Money.fromCents(100, 'CNY');
  const usd = Money.fromCents(100, 'USD');

  await t.test('add', () => {
    assert.throws(() => cny.add(usd), RangeError);
  });
  await t.test('subtract', () => {
    assert.throws(() => cny.subtract(usd), RangeError);
  });
  await t.test('isGreaterThan', () => {
    assert.throws(() => cny.isGreaterThan(usd), RangeError);
  });
  await t.test('isLessThan', () => {
    assert.throws(() => cny.isLessThan(usd), RangeError);
  });
  await t.test('isGreaterThanOrEqual', () => {
    assert.throws(() => cny.isGreaterThanOrEqual(usd), RangeError);
  });

  await t.test('錯誤訊息同時指出兩個幣別（否則無從除錯）', () => {
    try {
      cny.add(usd);
      assert.fail('應該拋錯');
    } catch (err) {
      assert.match(err.message, /CNY/);
      assert.match(err.message, /USD/);
    }
  });

  await t.test('⚠️ equals 不拋錯，但回傳 false（同分不同幣不相等）', () => {
    assert.equal(cny.equals(usd), false);
    assert.equal(cny.equals(Money.fromCents(100, 'CNY')), true);
  });
});

test('幣別在運算中保留', async (t) => {
  const usd = Money.fromCents(10000, 'USD');

  await t.test('add / subtract', () => {
    assert.equal(usd.add(Money.fromCents(1, 'USD')).currency, 'USD');
    assert.equal(usd.subtract(Money.fromCents(1, 'USD')).currency, 'USD');
  });
  await t.test('multiply', () => {
    assert.equal(usd.multiply(3).currency, 'USD');
  });
  await t.test('applyRate', () => {
    assert.equal(usd.applyRate(8000, Rounding.FLOOR_TO_CENT).currency, 'USD');
  });
});

test('幣別格式校驗', async (t) => {
  await t.test('只接受三碼', () => {
    assert.throws(() => Money.fromCents(1, 'RMB1'), TypeError);
    assert.throws(() => Money.fromCents(1, 'US'), TypeError);
    assert.throws(() => Money.fromCents(1, ''), TypeError);
    assert.throws(() => Money.fromCents(1, 123), TypeError);
  });

  await t.test('一律轉為大寫（避免 cny / CNY 被視為不同幣別）', () => {
    assert.equal(Money.fromCents(1, 'cny').currency, 'CNY');
    assert.equal(Money.fromCents(1, 'cny').equals(Money.fromCents(1, 'CNY')), true);
  });

  await t.test('不驗證是否為真實幣別（那是外部知識，值物件不該內建幣別表）', () => {
    assert.equal(Money.fromCents(1, 'XYZ').currency, 'XYZ');
  });
});
