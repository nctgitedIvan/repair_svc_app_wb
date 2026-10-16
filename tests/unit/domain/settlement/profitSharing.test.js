'use strict';

/**
 * ProfitSharingPolicy 測試。
 *
 * 三條主軸：基數參數化、讀快照不讀當前配置、不變式（師傅 + 平台 = 基數）。
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const { calculate, baseAmount, technicianShareOf, SharingBase } = require('../../../../packages/domain/settlement/ProfitSharingPolicy');
const { ProfitSharingTerms } = require('../../../../packages/domain/settlement/ProfitSharingTerms');
const { makeOrder } = require('../../../helpers/order');
const { Money, Rounding } = require('../../../../packages/shared-kernel/Money');

function terms(overrides = {}) {
  return new ProfitSharingTerms({
    base: SharingBase.SERVICE_FEE,
    technicianRateBp: 8000,
    platformRateBp: 2000,
    roundingMode: Rounding.FLOOR_TO_CENT,
    termsVersion: 'v1',
    ...overrides,
  });
}

function orderWith({ serviceFeeCents = 10000, materialFeeCents = 2500 } = {}) {
  return makeOrder({ serviceFeeCents, materialFeeCents });
}

test('基數：服務費（現行決策）', async (t) => {
  await t.test('不含材料費', () => {
    const order = orderWith({ serviceFeeCents: 10000, materialFeeCents: 2500 });
    assert.equal(baseAmount(order, terms()).cents, 10000, '材料費不參與分潤');
  });

  await t.test('無材料費時結果不變', () => {
    const order = orderWith({ serviceFeeCents: 8000, materialFeeCents: 0 });
    assert.equal(baseAmount(order, terms()).cents, 8000);
  });
});

test('⚠️ 基數參數化：改一個值就切換決策，不用改程式', async (t) => {
  await t.test('SERVICE_FEE_PLUS_MATERIAL', () => {
    const order = orderWith({ serviceFeeCents: 10000, materialFeeCents: 2500 });
    const t2 = terms({ base: SharingBase.SERVICE_FEE_PLUS_MATERIAL });
    assert.equal(baseAmount(order, t2).cents, 12500);
  });

  await t.test('未知基數 → 拋錯（不是靜默回 0）', () => {
    const order = orderWith();
    assert.throws(() => baseAmount(order, { base: 'WHATEVER' }), Error);
  });
});

test('⚠️ 不變式：師傅 + 平台 === 基數', async (t) => {
  const cases = [
    [10000, 8000],
    [3333, 8000],
    [1, 8000],
    [9999, 3333],
    [12345, 5000],
    [777, 10000],
    [555, 0],
  ];

  for (const [baseCents, rateBp] of cases) {
    await t.test(`基數 ${baseCents} × ${rateBp}bp`, () => {
      const order = orderWith({ serviceFeeCents: baseCents, materialFeeCents: 0 });
      const t2 = terms({ technicianRateBp: rateBp, platformRateBp: 10000 - rateBp });
      const r = calculate({ order, terms: t2 });
      assert.equal(
        r.technicianShare.cents + r.platformShare.cents,
        r.base.cents,
        '取整不得漏錢或多錢',
      );
      assert.equal(r.base.cents, baseCents);
    });
  }

  await t.test('取整差額歸平台（FLOOR_TO_CENT）', () => {
    const order = orderWith({ serviceFeeCents: 3333, materialFeeCents: 0 });
    const r = calculate({ order, terms: terms({ technicianRateBp: 8000, platformRateBp: 2000 }) });
    assert.equal(r.technicianShare.cents, 2666);
    assert.equal(r.platformShare.cents, 667, '差額歸平台');
  });
});

test('幣別', async (t) => {
  await t.test('繼承基數的幣別', () => {
    const order = orderWith({ serviceFeeCents: 10000, materialFeeCents: 0 });
    // 用 helper 建 USD 訂單
    const usdOrder = makeOrder({ serviceFeeCents: 10000, materialFeeCents: 0, currency: 'USD' });
    const r = calculate({ order: usdOrder, terms: terms() });
    assert.equal(r.currency, 'USD');
    assert.equal(r.technicianShare.currency, 'USD');
  });
});

test('回傳完整資訊', async (t) => {
  await t.test('含 base / 兩份份額 / 幣別 / 條款版本', () => {
    const order = orderWith();
    const r = calculate({ order, terms: terms({ termsVersion: 'v9' }) });
    assert.ok(r.base instanceof Money);
    assert.ok(r.technicianShare instanceof Money);
    assert.ok(r.platformShare instanceof Money);
    assert.equal(r.currency, 'CNY');
    assert.equal(r.termsVersion, 'v9');
  });

  await t.test('technicianShareOf 便利方法', () => {
    const order = orderWith({ serviceFeeCents: 10000, materialFeeCents: 0 });
    assert.equal(technicianShareOf(order, terms()).cents, 8000);
  });
});

test('⚠️ 純函式：只依賴傳入的 order 與 terms', async (t) => {
  await t.test('同樣輸入必得同樣輸出', () => {
    const order = orderWith();
    const t2 = terms();
    assert.equal(calculate({ order, terms: t2 }).technicianShare.cents, calculate({ order, terms: t2 }).technicianShare.cents);
  });

  await t.test('不修改傳入的物件', () => {
    const order = orderWith();
    const t2 = terms();
    const before = JSON.stringify(order.toPersistence());
    calculate({ order, terms: t2 });
    assert.equal(JSON.stringify(order.toPersistence()), before);
  });

  await t.test('缺參數 → 拋錯（不是靜默算錯）', () => {
    assert.throws(() => calculate({ order: null, terms: terms() }), Error);
    assert.throws(() => calculate({ order: orderWith(), terms: null }), Error);
  });
});
