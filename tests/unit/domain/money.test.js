'use strict';

/**
 * Money 單元測試。
 *
 * 這些測試**不需要**任何雲端環境、不需要網路、不需要 npm install。
 * 執行：npm run test:domain
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const { Money, Rounding } = require('../../../packages/shared-kernel/Money');

test('Money：建構與基本取值', async (t) => {
  await t.test('只接受整數分', () => {
    assert.equal(Money.fromCents(10000).cents, 10000);
    assert.throws(() => Money.fromCents(100.5), TypeError);
    assert.throws(() => Money.fromCents('100'), TypeError);
    assert.throws(() => Money.fromCents(null), TypeError);
  });

  await t.test('fromYuan 四捨五入到分', () => {
    assert.equal(Money.fromYuan(100).cents, 10000);
    assert.equal(Money.fromYuan(0.1).cents, 10);
    assert.equal(Money.fromYuan('12.34').cents, 1234);
    // 浮點陷阱：0.1 + 0.2 !== 0.3，但 fromYuan 會收斂到分
    assert.equal(Money.fromYuan(0.1 + 0.2).cents, 30);
  });

  await t.test('toYuanString 補齊兩位小數', () => {
    assert.equal(Money.fromCents(10000).toYuanString(), '100.00');
    assert.equal(Money.fromCents(5).toYuanString(), '0.05');
    assert.equal(Money.fromCents(0).toYuanString(), '0.00');
    assert.equal(Money.fromCents(-250).toYuanString(), '-2.50');
  });
});

test('Money：運算不可變', async (t) => {
  await t.test('add / subtract 回傳新物件，原物件不變', () => {
    const a = Money.fromCents(1000);
    const b = Money.fromCents(500);
    assert.equal(a.add(b).cents, 1500);
    assert.equal(a.cents, 1000, '原物件不得被修改');
    assert.equal(b.cents, 500);
  });

  await t.test('multiply 需要整數', () => {
    assert.equal(Money.fromCents(300).multiply(3).cents, 900);
    assert.throws(() => Money.fromCents(300).multiply(1.5), TypeError);
  });

  await t.test('物件被凍結，無法偷改', () => {
    const m = Money.fromCents(100);
    assert.throws(() => {
      'use strict';
      m.cents = 999;
    });
  });
});

test('Money：applyRate 分潤計算', async (t) => {
  await t.test('80% 的整數情境', () => {
    const base = Money.fromCents(10000);
    assert.equal(base.applyRate(8000, Rounding.FLOOR_TO_CENT).cents, 8000);
  });

  await t.test('FLOOR 對師傅不利、對平台有利，且兩者相加恆等於基數', () => {
    // 3333 分 × 80% = 2666.4 分
    const base = Money.fromCents(3333);
    const tech = base.applyRate(8000, Rounding.FLOOR_TO_CENT);
    const platform = base.subtract(tech); // 平台份額＝基數減師傅份額
    assert.equal(tech.cents, 2666);
    assert.equal(platform.cents, 667);
    assert.equal(tech.add(platform).cents, base.cents, '不得因取整而漏錢');
  });

  await t.test('不同取整模式', () => {
    const base = Money.fromCents(3333);
    assert.equal(base.applyRate(8000, Rounding.FLOOR_TO_CENT).cents, 2666);
    assert.equal(base.applyRate(8000, Rounding.ROUND_HALF_UP).cents, 2666);
    assert.equal(base.applyRate(8000, Rounding.CEIL_TO_CENT).cents, 2667);
  });

  await t.test('100% 與 0%', () => {
    const base = Money.fromCents(12345);
    assert.equal(base.applyRate(10000).cents, 12345);
    assert.equal(base.applyRate(0).cents, 0);
  });

  await t.test('拒絕非法比例', () => {
    const base = Money.fromCents(10000);
    assert.throws(() => base.applyRate(10001), RangeError, '超過 100% 應拒絕');
    assert.throws(() => base.applyRate(-1), RangeError, '負比例應拒絕');
    assert.throws(() => base.applyRate(80.5), TypeError, '非整數 basis point 應拒絕');
  });
});

test('Money：比較', async (t) => {
  await t.test('equals / 大小比較', () => {
    assert.ok(Money.fromCents(100).equals(Money.fromCents(100)));
    assert.ok(!Money.fromCents(100).equals(Money.fromCents(101)));
    assert.ok(Money.fromCents(101).isGreaterThan(Money.fromCents(100)));
    assert.ok(Money.fromCents(100).isGreaterThanOrEqual(Money.fromCents(100)));
    assert.ok(Money.fromCents(99).isLessThan(Money.fromCents(100)));
  });

  await t.test('isZero / isNegative / isPositive', () => {
    assert.ok(Money.zero().isZero());
    assert.ok(Money.fromCents(-1).isNegative());
    assert.ok(Money.fromCents(1).isPositive());
  });

  await t.test('與非 Money 比較應拋錯', () => {
    assert.throws(() => Money.fromCents(1).equals(1), TypeError);
    assert.throws(() => Money.fromCents(1).add(1), TypeError);
  });
});
