'use strict';

/**
 * AccessPolicy 測試。
 *
 * 核心是 **docs/01 §4.7.6 的三個範例**，加上「純函式」與「設定錯誤守衛」兩組。
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const { can, canBool, validatePermissionDefinition, CONSTRAINT_REGISTRY } = require('../../../../packages/domain/access/AccessPolicy');
const { Reason } = require('../../../../packages/domain/access/Decision');
const { MisconfiguredPermissionError } = require('../../../../packages/shared-kernel/Errors');

const CUSTOMER = { id: 'c-1', role: 'customer' };
const TECH = { id: 'u-tech', role: 'technician', technicianId: 'tech-1' };
const CS = {
  id: 'cs-1', role: 'cs_agent', regions: ['440306'],
  dailyRefundBudget: { date: '2026-10-16', usedCents: 0, limitCents: 100000 },
};
const ADMIN = { id: 'a-1', role: 'admin', permissions: ['admin.full'] };

test('⚠️ §4.7.6 範例 1：technician 對 orders.update_status', async (t) => {
  const order = { orderId: 'o1', customerId: 'c-1', technicianId: 'tech-1', statusValue: 30 };
  const resource = { order, targetStatus: 'ACCEPTED_PENDING_VISIT' };

  await t.test('接被指派給自己的單 → ALLOW', () => {
    assert.equal(can(TECH, 'orders.accept', resource).allowed, true);
  });

  await t.test('接別人的單 → NOT_ASSIGNED_TECHNICIAN', () => {
    const other = { ...TECH, technicianId: 'tech-2' };
    const d = can(other, 'orders.accept', resource);
    assert.equal(d.allowed, false);
    assert.equal(d.reason, Reason.NOT_ASSIGNED_TECHNICIAN);
  });

  await t.test('沒有 technicianId 的師傅 → 拒絕（fail-closed）', () => {
    const d = can({ id: 'x', role: 'technician' }, 'orders.accept', resource);
    assert.equal(d.reason, Reason.NOT_ASSIGNED_TECHNICIAN);
  });

  await t.test('客戶想接單 → 連 constraint 都不用跑（RBAC 先擋）', () => {
    assert.equal(can(CUSTOMER, 'orders.accept', resource).reason, Reason.ROLE_NOT_PERMITTED);
  });
});

test('⚠️ §4.7.6 範例 2：cs_agent 對 refunds.approve_small', async (t) => {
  const order = { paidCents: 50000, refundedCents: 0 };

  await t.test('單筆 150 元、累計 0 → ALLOW', () => {
    assert.equal(can(CS, 'refunds.approve_small', { requestedRefundCents: 15000, order }).allowed, true);
  });

  await t.test('單筆 250 元 → EXCEEDS_SINGLE_LIMIT', () => {
    const d = can(CS, 'refunds.approve_small', { requestedRefundCents: 25000, order });
    assert.equal(d.reason, Reason.EXCEEDS_SINGLE_LIMIT);
  });

  await t.test('⚠️ 累計超配額 → EXCEEDS_DAILY_QUOTA（螞蟻搬家防護）', () => {
    const nearlyFull = { ...CS, dailyRefundBudget: { date: '2026-10-16', usedCents: 90000, limitCents: 100000 } };
    const d = can(nearlyFull, 'refunds.approve_small', { requestedRefundCents: 15000, order });
    assert.equal(d.reason, Reason.EXCEEDS_DAILY_QUOTA);
    assert.equal(d.details.usedToday, 90000);
    assert.equal(d.details.requested, 15000);
  });

  await t.test('剛好用到配額上限 → 允許（邊界）', () => {
    const exact = { ...CS, dailyRefundBudget: { date: 'x', usedCents: 80000, limitCents: 100000 } };
    assert.equal(can(exact, 'refunds.approve_small', { requestedRefundCents: 20000, order }).allowed, true);
  });

  await t.test('⚠️ 讀不到配額 → 拒絕（fail-closed，不是放行）', () => {
    const d = can({ id: 'cs-2', role: 'cs_agent' }, 'refunds.approve_small', { requestedRefundCents: 100, order });
    assert.equal(d.reason, Reason.DAILY_BUDGET_UNAVAILABLE);
  });

  await t.test('超過已付金額 → EXCEEDS_PAID_AMOUNT', () => {
    const d = can(CS, 'refunds.approve_small', { requestedRefundCents: 15000, order: { paidCents: 10000, refundedCents: 0 } });
    assert.equal(d.reason, Reason.EXCEEDS_PAID_AMOUNT);
  });
});

test('⚠️ §4.7.6 範例 3：customer 對 orders.read', async (t) => {
  const order = { orderId: 'o1', customerId: 'c-1', statusValue: 70 };

  await t.test('讀自己的單 → ALLOW', () => {
    assert.equal(can(CUSTOMER, 'orders.read', { order }).allowed, true);
  });

  await t.test('讀別人的單 → NOT_OWNER（這就是純 RBAC 做不到的那一層）', () => {
    const d = can({ id: 'c-2', role: 'customer' }, 'orders.read', { order });
    assert.equal(d.reason, Reason.NOT_OWNER);
  });

  await t.test('未帶 order → RESOURCE_MISSING（fail-closed）', () => {
    assert.equal(can(CUSTOMER, 'orders.read', {}).reason, Reason.RESOURCE_MISSING);
  });
});

test('⚠️ admin.full 不得繞過 constraint', async (t) => {
  await t.test('硬上限（不得超過已付）對 admin.full 一樣生效', () => {
    const d = can(ADMIN, 'refunds.approve_small', {
      requestedRefundCents: 60000,
      order: { paidCents: 50000, refundedCents: 0 },
    });
    assert.equal(d.reason, Reason.EXCEEDS_PAID_AMOUNT, 'admin.full 只放寬 RBAC，不放寬 constraint');
  });

  await t.test('admin.full 可跳過單筆門檻與當日配額', () => {
    assert.equal(can(ADMIN, 'refunds.approve_small', {
      requestedRefundCents: 99000,
      order: { paidCents: 200000, refundedCents: 0 },
    }).allowed, true);
  });

  await t.test('admin.full 仍受 StateConstraint 約束', () => {
    const d = can(ADMIN, 'orders.accept', {
      order: { orderId: 'o1', technicianId: 't1', statusValue: 10 },
      targetStatus: 'ACCEPTED_PENDING_VISIT',
    });
    assert.equal(d.allowed, false, '未付款的訂單不能接單（狀態機不允許）');
  });
});

test('RBAC 先於 ABAC', async (t) => {
  await t.test('權限不足時，即使 constraint 會通過也拒絕', () => {
    // 客戶對自己的訂單有 ownership，但沒有 orders.accept 權限
    const d = can(CUSTOMER, 'orders.accept', {
      order: { orderId: 'o1', customerId: 'c-1', technicianId: null, statusValue: 30 },
      targetStatus: 'ACCEPTED_PENDING_VISIT',
    });
    assert.equal(d.reason, Reason.ROLE_NOT_PERMITTED);
  });

  await t.test('無效 actor', () => {
    assert.equal(can(null, 'orders.read', {}).allowed, false);
    assert.equal(can({}, 'orders.read', {}).allowed, false);
  });
});

test('⚠️ 設定錯誤守衛（本設計的核心防線）', async (t) => {
  await t.test('未知權限 key → 拋 MisconfiguredPermissionError（不是「無權」）', () => {
    assert.throws(() => can(ADMIN, 'orders.does_not_exist', {}), MisconfiguredPermissionError);
  });

  // ⚠️ Permission 的定義是凍結的，測試無法把它改成壞的。
  //    因此驗證邏輯獨立成 validatePermissionDefinition()，可直接餵壞資料。
  await t.test('缺少 constraints 欄位 → 拋錯，**不是預設放行**', () => {
    assert.throws(
      () => validatePermissionDefinition({ key: 'x.y' }, 'x.y'),
      (err) => {
        assert.ok(err instanceof MisconfiguredPermissionError);
        assert.match(err.details.problem, /缺少 constraints/);
        return true;
      },
    );
  });

  await t.test('constraints 不是陣列 → 拋錯', () => {
    assert.throws(() => validatePermissionDefinition({ key: 'x.y', constraints: null }, 'x.y'), MisconfiguredPermissionError);
    assert.throws(() => validatePermissionDefinition({ key: 'x.y', constraints: 'OwnershipConstraint' }, 'x.y'), MisconfiguredPermissionError);
  });

  await t.test('宣告未註冊的 constraint → 拋錯並指出名稱', () => {
    assert.throws(
      () => validatePermissionDefinition({ key: 'x.y', constraints: ['NoSuchConstraint'] }, 'x.y'),
      (err) => {
        assert.ok(err instanceof MisconfiguredPermissionError);
        assert.equal(err.details.unknownConstraint, 'NoSuchConstraint');
        return true;
      },
    );
  });

  await t.test('undefined 定義（未知權限）→ 拋錯', () => {
    assert.throws(() => validatePermissionDefinition(undefined, 'x.y'), MisconfiguredPermissionError);
  });

  await t.test('空陣列是**合法**的（刻意無限制，已明示意圖）', () => {
    assert.doesNotThrow(() => validatePermissionDefinition({ key: 'x.y', constraints: [] }, 'x.y'));
  });

  await t.test('真實的權限定義全部通過驗證', () => {
    const { ALL_PERMISSIONS } = require('../../../../packages/domain/access/Permission');
    for (const def of ALL_PERMISSIONS) {
      assert.doesNotThrow(() => validatePermissionDefinition(def, def.key), `${def.key} 設定不完整`);
    }
  });
});

test('純函式性質', async (t) => {
  await t.test('同輸入必得同輸出', () => {
    const order = { orderId: 'o1', customerId: 'c-1', statusValue: 70 };
    const a = can(CUSTOMER, 'orders.read', { order });
    const b = can(CUSTOMER, 'orders.read', { order });
    assert.equal(a.allowed, b.allowed);
    assert.equal(a.reason, b.reason);
  });

  await t.test('不修改傳入的物件', () => {
    const resource = { order: { orderId: 'o1', customerId: 'c-1', statusValue: 70 } };
    const snapshot = JSON.stringify(resource);
    can(CUSTOMER, 'orders.read', resource);
    assert.equal(JSON.stringify(resource), snapshot);
  });

  await t.test('無需時鐘即可判斷（時間由呼叫方以參數傳入）', () => {
    // can() 的簽章不含時鐘；需要時間的 constraint 從 resource 取得
    const order = { orderId: 'o1', customerId: 'c-1', statusValue: 70 };
    assert.doesNotThrow(() => can(CUSTOMER, 'orders.read', { order }));
  });
});

test('便利方法', async (t) => {
  const order = { orderId: 'o1', customerId: 'c-1', statusValue: 70 };

  await t.test('canBool', () => {
    assert.equal(canBool(CUSTOMER, 'orders.read', { order }), true);
    assert.equal(canBool(CUSTOMER, 'orders.read', { order: { ...order, customerId: 'other' } }), false);
  });

  await t.test('CONSTRAINT_REGISTRY 涵蓋 Permission 宣告的所有名稱', () => {
    const { ALL_PERMISSIONS } = require('../../../../packages/domain/access/Permission');
    for (const p of ALL_PERMISSIONS) {
      for (const name of p.constraints) {
        assert.ok(CONSTRAINT_REGISTRY[name], `${name} 未註冊`);
      }
    }
  });
});

test('多租戶：師傅不得跨 merchantId（AccessPolicy 整合）', async (t) => {
  const order = {
    orderId: 'o1',
    customerId: 'c-1',
    technicianId: 'tech-1',
    merchantId: 'merchant-a',
    statusValue: 30,
  };
  const resource = { order, targetStatus: 'ACCEPTED_PENDING_VISIT' };

  await t.test('同 merchantId → ALLOW', () => {
    const actor = { ...TECH, merchantId: 'merchant-a' };
    assert.equal(can(actor, 'orders.accept', resource).allowed, true);
  });

  await t.test('不同 merchantId → MERCHANT_MISMATCH（即使是被指派的師傅）', () => {
    const actor = { ...TECH, merchantId: 'merchant-b' };
    const decision = can(actor, 'orders.accept', resource);
    assert.equal(decision.allowed, false);
    assert.equal(decision.reason, Reason.MERCHANT_MISMATCH);
  });

  await t.test('客戶／客服／管理員不受 MerchantConstraint 影響', () => {
    assert.equal(can(CUSTOMER, 'orders.read', { order }).allowed, true);
    assert.equal(can(CS, 'orders.read_all', { order }).allowed, true);
    assert.equal(can(ADMIN, 'orders.read', { order }).allowed, true);
  });
});
