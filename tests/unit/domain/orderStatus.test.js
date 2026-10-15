'use strict';

/**
 * OrderStatus 單元測試。
 *
 * 這裡最重要的不是「測試有幾條」，而是第一組測試：
 * **它是一個針對 baseline 實際缺陷的回歸防護。**
 * 原專案 pages/order/config.js 讓四個不同意義的狀態共用數值 80，
 * 導致「逾時率」「取消率」永遠算不出來。以下測試確保新狀態機不再犯。
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  OrderStatus,
  TRANSITIONS,
  fromValue,
  fromKey,
  canTransition,
  isTerminal,
  canExecuteProfitSharing,
} = require('../../../packages/domain/order/OrderStatus');

test('回歸防護：狀態數值必須唯一（baseline 的缺陷）', async (t) => {
  await t.test('所有狀態的 value 互不重複', () => {
    const values = Object.values(OrderStatus).map((s) => s.value);
    const unique = new Set(values);
    assert.equal(
      unique.size,
      values.length,
      `狀態數值有重複：${JSON.stringify(values)}。` +
        'baseline 曾讓 PAYMENT_TIMEOUT / CANCELED_* 四個語意共用 80，導致統計失真。',
    );
  });

  await t.test('所有狀態的 key 互不重複', () => {
    const keys = Object.values(OrderStatus).map((s) => s.key);
    assert.equal(new Set(keys).size, keys.length);
  });

  await t.test('取消與逾時必須可區分', () => {
    assert.notEqual(OrderStatus.CANCELED_UNPAID.value, OrderStatus.EXPIRED_UNPAID.value);
    assert.notEqual(OrderStatus.CANCELED_PAID_REFUNDED.value, OrderStatus.EXPIRED_UNASSIGNED_REFUNDED.value);
  });
});

test('狀態還原', async (t) => {
  await t.test('fromValue 正確還原', () => {
    assert.equal(fromValue(10), OrderStatus.PENDING_PAYMENT);
    assert.equal(fromValue(65), OrderStatus.DISPUTED);
    assert.equal(fromValue(91), OrderStatus.CLOSED_REFUNDED);
  });

  await t.test('fromValue 對未知數值大聲失敗，不靜默回 undefined', () => {
    assert.throws(() => fromValue(999), RangeError);
    assert.throws(() => fromValue(null), RangeError);
    assert.throws(() => fromValue(undefined), RangeError);
  });

  await t.test('fromKey 正確還原、未知鍵拋錯', () => {
    assert.equal(fromKey('DISPUTED'), OrderStatus.DISPUTED);
    assert.throws(() => fromKey('NOT_A_STATUS'), RangeError);
  });
});

test('狀態機轉移', async (t) => {
  await t.test('合法轉移', () => {
    assert.ok(canTransition(OrderStatus.PENDING_PAYMENT, OrderStatus.PAID_PENDING_ASSIGN));
    assert.ok(canTransition(OrderStatus.PAID_PENDING_ASSIGN, OrderStatus.ASSIGNED_PENDING_ACCEPT));
    assert.ok(canTransition(OrderStatus.ASSIGNED_PENDING_ACCEPT, OrderStatus.ACCEPTED_PENDING_VISIT));
    assert.ok(canTransition(OrderStatus.ACCEPTED_PENDING_VISIT, OrderStatus.IN_SERVICE));
    assert.ok(canTransition(OrderStatus.IN_SERVICE, OrderStatus.PENDING_ACCEPTANCE));
    assert.ok(canTransition(OrderStatus.PENDING_ACCEPTANCE, OrderStatus.COMPLETED));
  });

  await t.test('拒單與逾時都退回待派單', () => {
    assert.ok(canTransition(OrderStatus.ASSIGNED_PENDING_ACCEPT, OrderStatus.PAID_PENDING_ASSIGN));
    assert.ok(canTransition(OrderStatus.ACCEPTED_PENDING_VISIT, OrderStatus.PAID_PENDING_ASSIGN));
  });

  await t.test('非法轉移（跳關）', () => {
    assert.ok(!canTransition(OrderStatus.PENDING_PAYMENT, OrderStatus.COMPLETED), '未付款不得直接完成');
    assert.ok(!canTransition(OrderStatus.PENDING_PAYMENT, OrderStatus.IN_SERVICE));
    assert.ok(!canTransition(OrderStatus.PAID_PENDING_ASSIGN, OrderStatus.COMPLETED));
    assert.ok(!canTransition(OrderStatus.IN_SERVICE, OrderStatus.COMPLETED), '須先經驗收');
  });

  await t.test('終態不得再轉移', () => {
    for (const status of Object.values(OrderStatus)) {
      if (isTerminal(status)) {
        assert.deepEqual(TRANSITIONS[status.key], [], `${status.key} 是終態，不應有任何出口`);
      }
    }
  });

  await t.test('轉移表的每個目標都是合法狀態（避免打錯字）', () => {
    for (const [from, targets] of Object.entries(TRANSITIONS)) {
      assert.ok(OrderStatus[from], `轉移表的來源 ${from} 不是合法狀態`);
      for (const to of targets) {
        assert.ok(OrderStatus[to], `轉移表 ${from} → ${to}：目標不是合法狀態`);
      }
    }
  });

  await t.test('轉移表的每個來源都有定義（不漏狀態）', () => {
    for (const status of Object.values(OrderStatus)) {
      assert.ok(TRANSITIONS[status.key] !== undefined, `狀態 ${status.key} 未定義轉移`);
    }
  });
});

test('爭議中（DISPUTED）必須凍結分帳', async (t) => {
  await t.test('只有 COMPLETED 可分帳', () => {
    assert.ok(canExecuteProfitSharing(OrderStatus.COMPLETED));
    assert.ok(!canExecuteProfitSharing(OrderStatus.DISPUTED));
  });

  await t.test('所有非 COMPLETED 狀態一律不可分帳', () => {
    for (const status of Object.values(OrderStatus)) {
      const expected = status.key === 'COMPLETED';
      assert.equal(
        canExecuteProfitSharing(status),
        expected,
        `${status.key} 的分帳權限判定錯誤`,
      );
    }
  });
});
