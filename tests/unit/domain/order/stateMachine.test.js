'use strict';

/**
 * OrderStateMachine 測試。
 *
 * 重點不只是「合法轉移能通過」，更是「**非法轉移必須被擋**」——
 * 後者才是狀態機存在的理由。
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const { OrderStateMachine } = require('../../../../packages/domain/order/OrderStateMachine');
const { OrderStatus, TRANSITIONS, isTerminal } = require('../../../../packages/domain/order/OrderStatus');
const { IllegalStateTransition } = require('../../../../packages/shared-kernel/Errors');

test('建立與基本查詢', async (t) => {
  await t.test('可用狀態物件或 key 建立', () => {
    assert.equal(new OrderStateMachine(OrderStatus.IN_SERVICE).statusKey, 'IN_SERVICE');
    assert.equal(OrderStateMachine.for('IN_SERVICE').statusKey, 'IN_SERVICE');
  });

  await t.test('未知狀態拋錯', () => {
    assert.throws(() => new OrderStateMachine('NOT_A_STATUS'), TypeError);
    assert.throws(() => new OrderStateMachine(null), TypeError);
  });

  await t.test('allowedTargets 與 TRANSITIONS 一致（不另維護一份表）', () => {
    for (const status of Object.values(OrderStatus)) {
      assert.deepEqual(
        OrderStateMachine.for(status).allowedTargets(),
        [...(TRANSITIONS[status.key] || [])],
        `${status.key} 的目標與 TRANSITIONS 不一致`,
      );
    }
  });
});

test('合法轉移', async (t) => {
  const legal = [
    ['PENDING_PAYMENT', 'PAID_PENDING_ASSIGN'],
    ['PAID_PENDING_ASSIGN', 'ASSIGNED_PENDING_ACCEPT'],
    ['ASSIGNED_PENDING_ACCEPT', 'ACCEPTED_PENDING_VISIT'],
    ['ACCEPTED_PENDING_VISIT', 'IN_SERVICE'],
    ['IN_SERVICE', 'PENDING_ACCEPTANCE'],
    ['PENDING_ACCEPTANCE', 'COMPLETED'],
    ['COMPLETED', 'CLOSED_REFUNDED'],
    ['PENDING_ACCEPTANCE', 'DISPUTED'],
    ['DISPUTED', 'COMPLETED'],
    ['IN_SERVICE', 'DISPUTED'],
  ];

  for (const [from, to] of legal) {
    await t.test(`${from} → ${to}`, () => {
      assert.ok(OrderStateMachine.for(from).canTransitionTo(to));
      assert.doesNotThrow(() => OrderStateMachine.for(from).assertCanTransitionTo(to));
    });
  }
});

test('非法轉移必須被擋', async (t) => {
  const illegal = [
    ['PENDING_PAYMENT', 'COMPLETED', '未付款不得直接完成'],
    ['PENDING_PAYMENT', 'IN_SERVICE', '未付款不得直接服務'],
    ['PENDING_PAYMENT', 'ACCEPTED_PENDING_VISIT', '未付款不得跳過派單'],
    ['PAID_PENDING_ASSIGN', 'COMPLETED', '未派單不得完成'],
    ['ASSIGNED_PENDING_ACCEPT', 'IN_SERVICE', '未接單不得直接服務'],
    ['ACCEPTED_PENDING_VISIT', 'COMPLETED', '未到場不得完成'],
    ['IN_SERVICE', 'COMPLETED', '未經完工回報不得完成'],
    ['COMPLETED', 'IN_SERVICE', '已完成不得回頭服務'],
    ['PENDING_PAYMENT', 'DISPUTED', '未付款不得提爭議'],
  ];

  for (const [from, to, why] of illegal) {
    await t.test(`${from} → ${to}（${why}）`, () => {
      assert.equal(OrderStateMachine.for(from).canTransitionTo(to), false);
      assert.throws(() => OrderStateMachine.for(from).assertCanTransitionTo(to), IllegalStateTransition);
    });
  }
});

test('非法轉移的錯誤訊息必須可除錯', async (t) => {
  await t.test('含 from / to', () => {
    try {
      OrderStateMachine.for('PENDING_PAYMENT').assertCanTransitionTo('COMPLETED');
      assert.fail('應該拋錯');
    } catch (err) {
      assert.match(err.message, /PENDING_PAYMENT/);
      assert.match(err.message, /COMPLETED/);
    }
  });

  await t.test('⚠️ 含「這個狀態允許哪些目標」—— 否則無從判斷該怎麼改', () => {
    try {
      OrderStateMachine.for('COMPLETED').assertCanTransitionTo('IN_SERVICE');
      assert.fail('應該拋錯');
    } catch (err) {
      assert.ok(Array.isArray(err.details.allowed), 'details.allowed 必須存在');
      assert.ok(err.details.allowed.includes('DISPUTED'));
      assert.ok(err.details.allowed.includes('VOIDED'));
      assert.equal(err.details.allowed.includes('IN_SERVICE'), false);
    }
  });
});

test('終態不得再轉移', async (t) => {
  await t.test('每個終態的 allowedTargets 皆為空', () => {
    for (const status of Object.values(OrderStatus)) {
      if (!isTerminal(status)) continue;
      assert.deepEqual(OrderStateMachine.for(status).allowedTargets(), [], `${status.key} 是終態`);
    }
  });

  await t.test('終態對任何目標都拋錯', () => {
    for (const status of Object.values(OrderStatus)) {
      if (!isTerminal(status)) continue;
      const machine = OrderStateMachine.for(status);
      for (const target of Object.values(OrderStatus)) {
        assert.throws(() => machine.assertCanTransitionTo(target), IllegalStateTransition);
      }
    }
  });
});

test('目標狀態的各種傳法', async (t) => {
  await t.test('狀態 key 字串', () => {
    assert.ok(OrderStateMachine.for('IN_SERVICE').canTransitionTo('PENDING_ACCEPTANCE'));
  });

  await t.test('狀態物件', () => {
    assert.ok(OrderStateMachine.for('IN_SERVICE').canTransitionTo(OrderStatus.PENDING_ACCEPTANCE));
  });

  await t.test('數值', () => {
    assert.ok(OrderStateMachine.for('IN_SERVICE').canTransitionTo(60));
  });

  await t.test('空值或無法解析者拋 TypeError（不是靜默回 false）', () => {
    assert.throws(() => OrderStateMachine.for('IN_SERVICE').canTransitionTo(null), TypeError);
    assert.throws(() => OrderStateMachine.for('IN_SERVICE').canTransitionTo(undefined), TypeError);
    assert.throws(() => OrderStateMachine.for('IN_SERVICE').canTransitionTo({ noKey: 1 }), TypeError);
  });
});

test('describe 供 UI 使用（但**不是**安全邊界）', async (t) => {
  await t.test('回傳狀態與可用目標', () => {
    const d = OrderStateMachine.for('PENDING_ACCEPTANCE').describe();
    assert.equal(d.status, 'PENDING_ACCEPTANCE');
    assert.equal(d.value, 60);
    assert.equal(d.terminal, false);
    assert.ok(d.allowedTargets.includes('COMPLETED'));
  });

  await t.test('⚠️ 它不判斷「誰」能轉 —— 那是 AccessPolicy 的職責', () => {
    // describe() 的簽章沒有任何 actor 參數，這在型別上就表達了職責邊界
    const d = OrderStateMachine.for('PENDING_PAYMENT').describe();
    assert.equal('actor' in d, false);
    assert.equal('allowedRoles' in d, false);
  });
});
