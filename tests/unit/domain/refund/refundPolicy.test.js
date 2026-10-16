'use strict';

/**
 * RefundScope 與 RefundPolicy 測試。
 *
 * 分工：Scope 回答「退什麼」，Policy 回答「能不能退、退多少」。
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const { RefundScope, RefundScopeType } = require('../../../../packages/domain/refund/RefundScope');
const { planRefund, previewAmounts, isScopeSelectable, DEFAULT_MAX_REFUND_COUNT } = require('../../../../packages/domain/refund/RefundPolicy');
const { makeOrder } = require('../../../helpers/order');

function orderWith({ serviceFeeCents = 10000, materialFeeCents = 2500 } = {}) {
  const order = makeOrder({ serviceFeeCents, materialFeeCents });
  return { items: order.items, amounts: order.amounts, paidCents: order.amounts.total.cents };
}

test('RefundScope：範圍值物件', async (t) => {
  await t.test('四種範圍', () => {
    assert.equal(RefundScope.serviceOnly().type, 'SERVICE_ONLY');
    assert.equal(RefundScope.materialOnly().type, 'MATERIAL_ONLY');
    assert.equal(RefundScope.full().type, 'FULL');
    assert.equal(RefundScope.customItems([0]).type, 'CUSTOM_ITEMS');
  });

  await t.test('⚠️ CUSTOM_ITEMS 必須帶明細索引', () => {
    assert.throws(() => new RefundScope(RefundScopeType.CUSTOM_ITEMS), Error);
    assert.throws(() => new RefundScope(RefundScopeType.CUSTOM_ITEMS, []), Error, '至少一項');
    assert.throws(() => new RefundScope(RefundScopeType.CUSTOM_ITEMS, [-1]), Error);
    assert.throws(() => new RefundScope(RefundScopeType.CUSTOM_ITEMS, [1.5]), Error);
  });

  await t.test('⚠️ 索引不得重複（會導致金額重複計算）', () => {
    assert.throws(() => new RefundScope(RefundScopeType.CUSTOM_ITEMS, [0, 0]), Error);
  });

  await t.test('非 CUSTOM_ITEMS 不得帶索引', () => {
    assert.throws(() => new RefundScope(RefundScopeType.FULL, [0]), Error);
  });

  await t.test('未知類型被擋', () => {
    assert.throws(() => new RefundScope('WHATEVER'), Error);
  });

  await t.test('includes 判斷正確', () => {
    const order = makeOrder({ serviceFeeCents: 10000, materialFeeCents: 2500 });
    const [service, material] = order.items;
    assert.equal(RefundScope.serviceOnly().includes(service, 0), true);
    assert.equal(RefundScope.serviceOnly().includes(material, 1), false);
    assert.equal(RefundScope.materialOnly().includes(material, 1), true);
    assert.equal(RefundScope.full().includes(material, 1), true);
    assert.equal(RefundScope.customItems([1]).includes(service, 0), false);
    assert.equal(RefundScope.customItems([1]).includes(material, 1), true);
  });
});

test('planRefund：四種範圍的金額', async (t) => {
  const order = orderWith();

  await t.test('只退服務費', () => {
    const r = planRefund({ order, scope: RefundScope.serviceOnly() });
    assert.equal(r.ok, true);
    assert.equal(r.amountCents, 10000);
  });

  await t.test('只退材料費', () => {
    assert.equal(planRefund({ order, scope: RefundScope.materialOnly() }).amountCents, 2500);
  });

  await t.test('全額', () => {
    assert.equal(planRefund({ order, scope: RefundScope.full() }).amountCents, 12500);
  });

  await t.test('按明細項勾選', () => {
    assert.equal(planRefund({ order, scope: RefundScope.customItems([0]) }).amountCents, 10000);
    assert.equal(planRefund({ order, scope: RefundScope.customItems([1]) }).amountCents, 2500);
    assert.equal(planRefund({ order, scope: RefundScope.customItems([0, 1]) }).amountCents, 12500);
  });

  await t.test('明細項包含數量', () => {
    const o = makeOrder({ serviceFeeCents: 1000, materialFeeCents: 0 });
    // 手動改數量不方便，改用數量已乘入的檢查：amount = 單價 × 數量
    const r = planRefund({ order: { items: o.items, paidCents: o.amounts.total.cents }, scope: RefundScope.full() });
    assert.equal(r.amountCents, o.amounts.total.cents);
  });
});

test('⚠️ 累計硬上限：不得超過已付', async (t) => {
  const order = orderWith({ serviceFeeCents: 10000, materialFeeCents: 2500 });

  await t.test('首次全額 → 通過', () => {
    assert.equal(planRefund({ order, scope: RefundScope.full() }).ok, true);
  });

  await t.test('已退過一部分 → 只能退剩下的', () => {
    const r = planRefund({ order, scope: RefundScope.full(), alreadyRefundedCents: 5000 });
    assert.equal(r.ok, false);
    assert.equal(r.reason, 'EXCEEDS_REFUNDABLE');
    assert.equal(r.details.refundableCents, 7500);
  });

  await t.test('剛好退完剩下的 → 通過', () => {
    const r = planRefund({ order, scope: RefundScope.serviceOnly(), alreadyRefundedCents: 2500 });
    assert.equal(r.ok, true);
    assert.equal(r.amountCents, 10000);
    assert.equal(r.refundableCentsAfter, 0);
  });

  await t.test('已全額退過 → 拒絕', () => {
    const r = planRefund({ order, scope: RefundScope.serviceOnly(), alreadyRefundedCents: 12500 });
    assert.equal(r.ok, false);
    assert.equal(r.details.refundableCents, 0);
  });

  await t.test('已退超過已付（資料異常）→ 拒絕，不回負數', () => {
    const r = planRefund({ order, scope: RefundScope.full(), alreadyRefundedCents: 99999 });
    assert.equal(r.ok, false);
    assert.equal(r.details.refundableCents, 0);
  });
});

test('⚠️ 退款次數上限', async (t) => {
  const order = orderWith();

  await t.test('未達上限 → 通過', () => {
    assert.equal(planRefund({ order, scope: RefundScope.serviceOnly(), refundCount: 49 }).ok, true);
  });

  await t.test('達上限 → 拒絕', () => {
    const r = planRefund({ order, scope: RefundScope.serviceOnly(), refundCount: DEFAULT_MAX_REFUND_COUNT });
    assert.equal(r.ok, false);
    assert.equal(r.reason, 'MAX_REFUND_COUNT_REACHED');
  });

  await t.test('上限可設定', () => {
    assert.equal(planRefund({ order, scope: RefundScope.serviceOnly(), refundCount: 3, maxRefundCount: 3 }).ok, false);
    assert.equal(planRefund({ order, scope: RefundScope.serviceOnly(), refundCount: 3, maxRefundCount: 4 }).ok, true);
  });
});

test('邊界與錯誤', async (t) => {
  await t.test('⚠️ 範圍挑不到任何明細 → EMPTY_SCOPE', () => {
    const o = makeOrder({ serviceFeeCents: 10000, materialFeeCents: 0 });
    const onlyService = { items: o.items, paidCents: o.amounts.total.cents };
    const r = planRefund({ order: onlyService, scope: RefundScope.materialOnly() });
    assert.equal(r.ok, false);
    assert.equal(r.reason, 'EMPTY_SCOPE');
  });

  await t.test('缺 order / scope → 拋錯', () => {
    assert.throws(() => planRefund({ scope: RefundScope.full() }), Error);
    assert.throws(() => planRefund({ order: orderWith() }), Error);
  });

  await t.test('負的已退金額 → 拋錯', () => {
    assert.throws(() => planRefund({ order: orderWith(), scope: RefundScope.full(), alreadyRefundedCents: -1 }), Error);
  });

  await t.test('breakdown 保留快照名稱供稽核', () => {
    const r = planRefund({ order: orderWith(), scope: RefundScope.full() });
    assert.equal(r.breakdown.length, 2);
    assert.ok(r.breakdown[0].nameSnapshot);
    assert.equal(r.breakdown[0].feeType, 'SERVICE_FEE');
  });
});

test('previewAmounts：供客服 UI 顯示選項', async (t) => {
  await t.test('各範圍涵蓋的金額', () => {
    const p = previewAmounts({ order: orderWith() });
    assert.deepEqual(p.amounts, { SERVICE_ONLY: 10000, MATERIAL_ONLY: 2500, FULL: 12500 });
    assert.equal(p.refundableCents, 12500);
  });

  await t.test('⚠️ 各範圍金額與「可退上限」分開回報（不合併成一個誤導的數字）', () => {
    const p = previewAmounts({ order: orderWith(), alreadyRefundedCents: 11000 });
    assert.equal(p.refundableCents, 1500, '還能退 1500');
    assert.equal(p.amounts.SERVICE_ONLY, 10000, '服務費本身仍是 10000，不因餘額不足而改變');
    assert.equal(p.amounts.MATERIAL_ONLY, 2500);
    assert.equal(p.amounts.FULL, 12500);
    assert.equal(p.alreadyRefundedCents, 11000);
    assert.equal(p.paidCents, 12500);
  });

  await t.test('⚠️ isScopeSelectable 讓 UI 停用退不起的選項', () => {
    const p = previewAmounts({ order: orderWith(), alreadyRefundedCents: 11000 });
    assert.equal(isScopeSelectable(p, RefundScopeType.SERVICE_ONLY), false, '服務費 10000 > 可退 1500');
    assert.equal(isScopeSelectable(p, RefundScopeType.FULL), false, '全額 12500 > 可退 1500');
    assert.equal(isScopeSelectable(p, RefundScopeType.MATERIAL_ONLY), false, '材料費 2500 > 可退 1500');
  });

  await t.test('isScopeSelectable 的邊界：剛好等於可退 → 可選', () => {
    const p = previewAmounts({ order: orderWith(), alreadyRefundedCents: 10000 });
    assert.equal(p.refundableCents, 2500);
    assert.equal(isScopeSelectable(p, RefundScopeType.MATERIAL_ONLY), true, '2500 <= 2500');
  });

  await t.test('已全額退完 → 全部不可選', () => {
    const p = previewAmounts({ order: orderWith(), alreadyRefundedCents: 12500 });
    assert.equal(p.refundableCents, 0);
    for (const type of Object.values(RefundScopeType)) {
      assert.equal(isScopeSelectable(p, type), false, `${type} 應不可選`);
    }
  });
});
