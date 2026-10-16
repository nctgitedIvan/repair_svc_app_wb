'use strict';

/**
 * PricingService 測試。
 *
 * 最重要的一條不變式：**服務費 + 材料費 === 總額**。
 * 若它不成立，退款可以退超過已付、或分潤基數會與總額對不上 ——
 * 這類錯誤在對帳時才會發現，屆時已難以回溯。
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const { priceItems, sumItemsWhere } = require('../../../../packages/domain/order/PricingService');
const { OrderItem, ItemType, FeeType } = require('../../../../packages/domain/order/OrderItem');
const { Money } = require('../../../../packages/shared-kernel/Money');

function item({ feeType, cents, qty = 1, currency = 'CNY' }) {
  return new OrderItem({
    itemType: feeType === FeeType.SERVICE_FEE ? ItemType.SERVICE : ItemType.PRODUCT,
    itemRefId: `ref-${cents}`,
    nameSnapshot: `項目 ${cents}`,
    unitPriceSnapshot: Money.fromCents(cents, currency),
    quantity: qty,
    feeType,
    commissionRateBpSnapshot: 8000,
  });
}

test('基本計算', async (t) => {
  await t.test('服務費 + 材料費 = 總額', () => {
    const p = priceItems([item({ feeType: FeeType.SERVICE_FEE, cents: 10000 }), item({ feeType: FeeType.MATERIAL_FEE, cents: 2500 })]);
    assert.equal(p.serviceFee.cents, 10000);
    assert.equal(p.materialFee.cents, 2500);
    assert.equal(p.total.cents, 12500);
  });

  await t.test('多筆同類別會累加', () => {
    const p = priceItems([
      item({ feeType: FeeType.SERVICE_FEE, cents: 1000 }),
      item({ feeType: FeeType.SERVICE_FEE, cents: 2000 }),
      item({ feeType: FeeType.MATERIAL_FEE, cents: 300 }),
    ]);
    assert.equal(p.serviceFee.cents, 3000);
    assert.equal(p.materialFee.cents, 300);
    assert.equal(p.total.cents, 3300);
  });

  await t.test('數量會相乘', () => {
    const p = priceItems([item({ feeType: FeeType.MATERIAL_FEE, cents: 2500, qty: 3 })]);
    assert.equal(p.materialFee.cents, 7500);
    assert.equal(p.total.cents, 7500);
  });

  await t.test('只有服務費（無材料）', () => {
    const p = priceItems([item({ feeType: FeeType.SERVICE_FEE, cents: 9999 })]);
    assert.equal(p.materialFee.cents, 0);
    assert.equal(p.total.cents, 9999);
  });

  await t.test('只有材料費', () => {
    const p = priceItems([item({ feeType: FeeType.MATERIAL_FEE, cents: 500 })]);
    assert.equal(p.serviceFee.cents, 0);
    assert.equal(p.total.cents, 500);
  });

  await t.test('幣別帶出', () => {
    const p = priceItems([item({ feeType: FeeType.SERVICE_FEE, cents: 100, currency: 'USD' })]);
    assert.equal(p.currency, 'USD');
    assert.equal(p.total.currency, 'USD');
  });
});

test('⚠️ 不變式：服務費 + 材料費 恆等於明細加總', async (t) => {
  const cases = [
    [1, 1],
    [3, 7],
    [9999, 1],
    [1, 9999],
    [3333, 3333],
    [12345, 67890],
  ];

  for (const [a, b] of cases) {
    await t.test(`${a} + ${b}`, () => {
      const items = [item({ feeType: FeeType.SERVICE_FEE, cents: a }), item({ feeType: FeeType.MATERIAL_FEE, cents: b })];
      const p = priceItems(items);
      const raw = items.reduce((s, i) => s + i.amount.cents, 0);
      assert.equal(p.total.cents, raw);
      assert.equal(p.serviceFee.cents + p.materialFee.cents, p.total.cents);
    });
  }

  await t.test('大量明細仍成立（無累積誤差）', () => {
    const items = [];
    for (let i = 1; i <= 200; i++) {
      items.push(item({ feeType: i % 2 === 0 ? FeeType.SERVICE_FEE : FeeType.MATERIAL_FEE, cents: i * 7 }));
    }
    const p = priceItems(items);
    const raw = items.reduce((s, i) => s + i.amount.cents, 0);
    assert.equal(p.total.cents, raw);
    assert.equal(p.serviceFee.cents + p.materialFee.cents, raw, '過程中涉及大量加法，仍不得有誤差');
  });
});

test('錯誤處理', async (t) => {
  await t.test('⚠️ 空明細必須拒絕（否則會產生 0 元訂單）', () => {
    assert.throws(() => priceItems([]), Error);
  });

  await t.test('非陣列拒絕', () => {
    assert.throws(() => priceItems(null), Error);
    assert.throws(() => priceItems({}), Error);
  });

  await t.test('⚠️ 混合幣別必須拒絕（否則會把 USD 當 CNY 加）', () => {
    assert.throws(
      () => priceItems([
        item({ feeType: FeeType.SERVICE_FEE, cents: 100, currency: 'CNY' }),
        item({ feeType: FeeType.MATERIAL_FEE, cents: 100, currency: 'USD' }),
      ]),
      Error,
    );
  });
});

test('sumItemsWhere：依條件挑選明細金額', async (t) => {
  const items = [
    item({ feeType: FeeType.SERVICE_FEE, cents: 1000 }),
    item({ feeType: FeeType.MATERIAL_FEE, cents: 200 }),
    item({ feeType: FeeType.MATERIAL_FEE, cents: 300 }),
  ];

  await t.test('只挑服務費', () => {
    assert.equal(sumItemsWhere(items, (i) => i.isServiceFee()).cents, 1000);
  });

  await t.test('只挑材料費', () => {
    assert.equal(sumItemsWhere(items, (i) => i.isMaterialFee()).cents, 500);
  });

  await t.test('全部（供「全額退款」使用）', () => {
    assert.equal(sumItemsWhere(items, () => true).cents, 1500);
  });

  await t.test('都不挑 → 0（歸屬幣別的零元）', () => {
    const zero = sumItemsWhere(items, () => false);
    assert.equal(zero.cents, 0);
    assert.equal(zero.currency, 'CNY', '零元仍必須帶正確幣別，否則後續運算會拋錯');
  });

  await t.test('空明細 → 不爆', () => {
    assert.equal(sumItemsWhere([], () => true).cents, 0);
  });
});
