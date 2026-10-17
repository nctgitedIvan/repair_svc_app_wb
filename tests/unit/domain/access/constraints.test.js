'use strict';

/**
 * 七個 constraint 的邊界測試。
 *
 * 共同原則：**所有「讀不到判斷所需資料」的情況一律拒絕（fail-closed）**。
 * 放行等於讓約束可以被「不填欄位」繞過。
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const { OwnershipConstraint } = require('../../../../packages/domain/access/constraints/OwnershipConstraint');
const { MerchantConstraint } = require('../../../../packages/domain/access/constraints/MerchantConstraint');
const { StateConstraint, TARGET_RULES } = require('../../../../packages/domain/access/constraints/StateConstraint');
const { RegionConstraint } = require('../../../../packages/domain/access/constraints/RegionConstraint');
const { AmountConstraint } = require('../../../../packages/domain/access/constraints/AmountConstraint');
const { PeriodConstraint, dayEndMillis } = require('../../../../packages/domain/access/constraints/PeriodConstraint');
const { SoDConstraint } = require('../../../../packages/domain/access/constraints/SoDConstraint');
const { Reason } = require('../../../../packages/domain/access/Decision');
const { OrderStatus } = require('../../../../packages/domain/order/OrderStatus');

test('OwnershipConstraint', async (t) => {
  const order = { orderId: 'o1', customerId: 'c-1', technicianId: 'tech-1' };

  await t.test('客戶讀自己的單', () => {
    assert.equal(OwnershipConstraint.check({ id: 'c-1', role: 'customer' }, { order }).allowed, true);
  });
  await t.test('客戶讀他人的單 → NOT_OWNER', () => {
    assert.equal(OwnershipConstraint.check({ id: 'c-2', role: 'customer' }, { order }).reason, Reason.NOT_OWNER);
  });
  await t.test('師傅讀被指派給自己的單', () => {
    assert.equal(OwnershipConstraint.check({ id: 'u', role: 'technician', technicianId: 'tech-1' }, { order }).allowed, true);
  });
  await t.test('師傅讀他人的單 → NOT_ASSIGNED_TECHNICIAN', () => {
    assert.equal(
      OwnershipConstraint.check({ id: 'u', role: 'technician', technicianId: 'tech-2' }, { order }).reason,
      Reason.NOT_ASSIGNED_TECHNICIAN,
    );
  });
  await t.test('客服與管理員不走歸屬約束（由矩陣決定）', () => {
    assert.equal(OwnershipConstraint.check({ id: 'x', role: 'cs_agent' }, { order }).allowed, true);
    assert.equal(OwnershipConstraint.check({ id: 'x', role: 'admin' }, { order }).allowed, true);
  });
  await t.test('⚠️ 沒有 order → 拒絕（fail-closed）', () => {
    assert.equal(OwnershipConstraint.check({ id: 'c-1', role: 'customer' }, {}).reason, Reason.RESOURCE_MISSING);
  });
  await t.test('未知角色 → 拒絕', () => {
    assert.equal(OwnershipConstraint.check({ id: 'x', role: 'ghost' }, { order }).reason, Reason.ROLE_NOT_PERMITTED);
  });
});

test('MerchantConstraint（多租戶）', async (t) => {
  const order = { orderId: 'o1', customerId: 'c-1', technicianId: 'tech-1', merchantId: 'merchant-a' };

  await t.test('師傅同 merchantId → 允許', () => {
    const actor = { id: 'u', role: 'technician', technicianId: 'tech-1', merchantId: 'merchant-a' };
    assert.equal(MerchantConstraint.check(actor, { order }).allowed, true);
  });

  await t.test('師傅跨 merchantId → MERCHANT_MISMATCH', () => {
    const actor = { id: 'u', role: 'technician', technicianId: 'tech-1', merchantId: 'merchant-b' };
    assert.equal(MerchantConstraint.check(actor, { order }).reason, Reason.MERCHANT_MISMATCH);
  });

  await t.test('缺少 merchantId 時雙方都預設 platform', () => {
    const actor = { id: 'u', role: 'technician', technicianId: 'tech-1' };
    const noMerchantOrder = { ...order, merchantId: undefined };
    assert.equal(MerchantConstraint.check(actor, { order: noMerchantOrder }).allowed, true);
  });

  await t.test('非師傅角色不走商戶約束', () => {
    for (const role of ['customer', 'cs_agent', 'admin']) {
      assert.equal(MerchantConstraint.check({ id: 'x', role }, { order }).allowed, true);
    }
  });

  await t.test('⚠️ 沒有 order → 拒絕（fail-closed）', () => {
    const actor = { id: 'u', role: 'technician', technicianId: 'tech-1' };
    assert.equal(MerchantConstraint.check(actor, {}).reason, Reason.RESOURCE_MISSING);
  });

  await t.test('未知角色 → 拒絕', () => {
    assert.equal(MerchantConstraint.check({ role: 'ghost' }, { order }).reason, Reason.ROLE_NOT_PERMITTED);
  });
});

test('StateConstraint', async (t) => {
  const tech = { id: 'u', role: 'technician', technicianId: 't1' };
  const ctx = (k) => ({ permissionKey: k });

  await t.test('師傅接單：狀態 30 → 40 合法', () => {
    const order = { orderId: 'o1', technicianId: 't1', statusValue: 30 };
    assert.equal(
      StateConstraint.check(tech, { order, targetStatus: 'ACCEPTED_PENDING_VISIT' }, ctx('orders.accept')).allowed,
      true,
    );
  });

  await t.test('⚠️ 角色允許但狀態機不允許 → ILLEGAL_STATE_TRANSITION', () => {
    // 師傅在狀態 10（待付款）想接單 —— ALLOWED 目標含 ACCEPTED_PENDING_VISIT，
    // 但狀態機不允許 10 → 40
    const order = { orderId: 'o1', technicianId: 't1', statusValue: 10 };
    const d = StateConstraint.check(tech, { order, targetStatus: 'ACCEPTED_PENDING_VISIT' }, ctx('orders.accept'));
    assert.equal(d.reason, Reason.ILLEGAL_STATE_TRANSITION);
  });

  await t.test('⚠️ 狀態機允許但角色不允許 → TARGET_NOT_ALLOWED_FOR_ROLE', () => {
    // 師傅想取消訂單（狀態機允許 30 → 82，但師傅的角色規則沒有這條）
    const order = { orderId: 'o1', technicianId: 't1', statusValue: 30 };
    const d = StateConstraint.check(tech, { order, targetStatus: 'CANCELED_PAID_REFUNDED' }, ctx('orders.cancel'));
    assert.equal(d.reason, Reason.ROLE_CANNOT_TRANSITION, 'orders.cancel 不在 technician 的規則中');
  });

  await t.test('角色在此權限下完全沒有規則 → ROLE_CANNOT_TRANSITION', () => {
    const order = { orderId: 'o1', statusValue: 30 };
    const d = StateConstraint.check({ id: 'x', role: 'customer' }, { order, targetStatus: 'ASSIGNED_PENDING_ACCEPT' }, ctx('orders.assign'));
    assert.equal(d.reason, Reason.ROLE_CANNOT_TRANSITION);
  });

  await t.test('未指定 targetStatus → 只檢查角色有沒有這個權限', () => {
    const order = { orderId: 'o1', statusValue: 30 };
    assert.equal(StateConstraint.check(tech, { order }, ctx('orders.accept')).allowed, true);
  });

  await t.test('⚠️ TARGET_RULES 的目標必須是合法狀態（避免打錯字）', () => {
    for (const [role, rules] of Object.entries(TARGET_RULES)) {
      for (const [perm, targets] of Object.entries(rules)) {
        for (const tgt of targets) {
          assert.ok(OrderStatus[tgt], `${role}/${perm} 的目標 ${tgt} 不是合法狀態`);
        }
      }
    }
  });

  await t.test('⚠️ TARGET_RULES 不得與狀態機矛盾（不重新定義可達性）', () => {
    const { canTransition, fromKey } = require('../../../../packages/domain/order/OrderStatus');
    // 抽樣：技術員接單的目標，在狀態機中確實可從某個狀態到達
    const reachable = Object.values(OrderStatus).some((from) => canTransition(from, fromKey('ACCEPTED_PENDING_VISIT')));
    assert.ok(reachable, 'ACCEPTED_PENDING_VISIT 必須是可達的');
  });
});

test('RegionConstraint', async (t) => {
  await t.test('區域相符 → 允許', () => {
    assert.equal(RegionConstraint.check({ role: 'cs_agent', regions: ['440306'] }, { regionCode: '440306' }).allowed, true);
  });
  await t.test('區域不符 → OUT_OF_REGION', () => {
    assert.equal(
      RegionConstraint.check({ role: 'cs_agent', regions: ['440306'] }, { regionCode: '440305' }).reason,
      Reason.OUT_OF_REGION,
    );
  });
  await t.test("'*' 代表全區", () => {
    assert.equal(RegionConstraint.check({ role: 'cs_agent', regions: ['*'] }, { regionCode: 'anything' }).allowed, true);
  });
  await t.test('從技師物件取區碼', () => {
    assert.equal(
      RegionConstraint.check({ role: 'cs_agent', regions: ['440306'] }, { technician: { regionCode: '440306' } }).allowed,
      true,
    );
  });
  await t.test('⚠️ 無區域資訊 → 拒絕（fail-closed）', () => {
    assert.equal(RegionConstraint.check({ role: 'cs_agent', regions: ['440306'] }, {}).reason, Reason.RESOURCE_MISSING);
  });
  await t.test('⚠️ 空 regions → 拒絕', () => {
    assert.equal(
      RegionConstraint.check({ role: 'cs_agent', regions: [] }, { regionCode: '440306' }).reason,
      Reason.OUT_OF_REGION,
    );
  });
});

test('AmountConstraint', async (t) => {
  const order = { paidCents: 100000, refundedCents: 0 };
  const cs = { role: 'cs_agent', dailyRefundBudget: { usedCents: 0, limitCents: 100000 } };

  await t.test('① 單筆門檻：200 元邊界', () => {
    assert.equal(AmountConstraint.check(cs, { requestedRefundCents: 20000, order }).allowed, true, '剛好 200 元');
    assert.equal(AmountConstraint.check(cs, { requestedRefundCents: 20001, order }).reason, Reason.EXCEEDS_SINGLE_LIMIT);
  });

  await t.test('② 當日配額：累計邊界', () => {
    const nearlyFull = { ...cs, dailyRefundBudget: { usedCents: 80000, limitCents: 100000 } };
    assert.equal(AmountConstraint.check(nearlyFull, { requestedRefundCents: 20000, order }).allowed, true, '剛好用滿');
    assert.equal(
      AmountConstraint.check({ ...nearlyFull, dailyRefundBudget: { usedCents: 80001, limitCents: 100000 } },
        { requestedRefundCents: 20000, order }).reason,
      Reason.EXCEEDS_DAILY_QUOTA,
    );
  });

  await t.test('③ 硬上限：不得超過已付未退', () => {
    assert.equal(
      AmountConstraint.check(cs, { requestedRefundCents: 20000, order: { paidCents: 15000, refundedCents: 0 } }).reason,
      Reason.EXCEEDS_PAID_AMOUNT,
    );
  });

  await t.test('③ 已退過的部分要扣除', () => {
    const d = AmountConstraint.check(cs, { requestedRefundCents: 20000, order: { paidCents: 30000, refundedCents: 15000 } });
    assert.equal(d.reason, Reason.EXCEEDS_PAID_AMOUNT, '可退只剩 15000');
  });

  await t.test('⚠️ ③ 對 admin 一樣生效（admin 只跳過 ①②）', () => {
    const admin = { role: 'admin' };
    // 999 元：超過客服的 200 元單筆門檻，但**沒有**超過已付的 2000 元
    const bigOrder = { paidCents: 200000, refundedCents: 0 };
    assert.equal(
      AmountConstraint.check(admin, { requestedRefundCents: 99900, order: bigOrder }).allowed,
      true,
      'admin 跳過單筆門檻與當日配額',
    );
    assert.equal(
      AmountConstraint.check(admin, { requestedRefundCents: 200001, order: bigOrder }).reason,
      Reason.EXCEEDS_PAID_AMOUNT,
      '但硬上限仍適用',
    );
    assert.equal(
      AmountConstraint.check(admin, { requestedRefundCents: 99900 }).allowed,
      true,
      'admin 不需要 dailyRefundBudget',
    );
    assert.equal(
      AmountConstraint.check(admin, { requestedRefundCents: 60000, order: { paidCents: 50000, refundedCents: 0 } }).reason,
      Reason.EXCEEDS_PAID_AMOUNT,
      '但硬上限仍適用',
    );
  });

  await t.test('⚠️ 讀不到配額 → 拒絕（fail-closed）', () => {
    assert.equal(
      AmountConstraint.check({ role: 'cs_agent' }, { requestedRefundCents: 100, order }).reason,
      Reason.DAILY_BUDGET_UNAVAILABLE,
    );
    assert.equal(
      AmountConstraint.check({ role: 'cs_agent', dailyRefundBudget: { usedCents: 'x', limitCents: 1 } },
        { requestedRefundCents: 100, order }).reason,
      Reason.DAILY_BUDGET_UNAVAILABLE,
    );
  });

  await t.test('非法金額', () => {
    assert.equal(AmountConstraint.check(cs, { requestedRefundCents: 1.5, order }).reason, Reason.INVALID_AMOUNT);
    assert.equal(AmountConstraint.check(cs, { requestedRefundCents: 0, order }).reason, Reason.AMOUNT_NOT_POSITIVE);
    assert.equal(AmountConstraint.check(cs, { requestedRefundCents: -100, order }).reason, Reason.AMOUNT_NOT_POSITIVE);
    assert.equal(AmountConstraint.check(cs, { order }).reason, Reason.INVALID_AMOUNT);
  });

  await t.test('threshold 可由 system_configs 收緊', () => {
    const d = AmountConstraint.check(cs, { requestedRefundCents: 5000, order, singleLimitCents: 1000 });
    assert.equal(d.reason, Reason.EXCEEDS_SINGLE_LIMIT);
  });
});

test('PeriodConstraint', async (t) => {
  const CLOSED = '2026-09-30';
  const closedMs = dayEndMillis(CLOSED);
  const inPeriod = { orderId: 'o1', completedAt: closedMs - 86_400_000 };
  const afterPeriod = { orderId: 'o2', completedAt: closedMs + 86_400_000 };

  await t.test('未關帳 → 允許', () => {
    assert.equal(
      PeriodConstraint.check({ role: 'cs_agent' }, { amountChange: { reasonCode: 'REFUND_FULL' }, order: inPeriod }).allowed,
      true,
    );
  });

  await t.test('關帳期間內改金額 → PERIOD_CLOSED', () => {
    const d = PeriodConstraint.check({ role: 'cs_agent' }, {
      amountChange: { reasonCode: 'REFUND_FULL' }, accountingClosedThrough: CLOSED, order: inPeriod,
    });
    assert.equal(d.reason, Reason.PERIOD_CLOSED);
  });

  await t.test('關帳期間後 → 允許', () => {
    assert.equal(
      PeriodConstraint.check({ role: 'cs_agent' }, {
        amountChange: { reasonCode: 'REFUND_FULL' }, accountingClosedThrough: CLOSED, order: afterPeriod,
      }).allowed,
      true,
    );
  });

  await t.test('⚠️ 沖銷是關帳期間的唯一例外', () => {
    assert.equal(
      PeriodConstraint.check({ role: 'admin' }, {
        amountChange: { reasonCode: 'REVERSAL' }, accountingClosedThrough: CLOSED, order: inPeriod,
      }).allowed,
      true,
      '若沖銷也被擋，財報錯誤將永遠無法修正',
    );
  });

  await t.test('不改金額的操作不受影響', () => {
    assert.equal(PeriodConstraint.check({ role: 'cs_agent' }, { accountingClosedThrough: CLOSED, order: inPeriod }).allowed, true);
  });

  await t.test('⚠️ 有金額變更但沒有 order → 拒絕', () => {
    assert.equal(
      PeriodConstraint.check({ role: 'cs_agent' }, { amountChange: { reasonCode: 'REFUND_FULL' }, accountingClosedThrough: CLOSED }).reason,
      Reason.RESOURCE_MISSING,
    );
  });

  await t.test('⚠️ 有金額變更但沒有 reasonCode → 拒絕', () => {
    assert.equal(
      PeriodConstraint.check({ role: 'cs_agent' }, { amountChange: {}, accountingClosedThrough: CLOSED, order: inPeriod }).reason,
      Reason.RESOURCE_MISSING,
    );
  });

  await t.test('dayEndMillis 用 UTC 解析（不隨執行環境時區漂移）', () => {
    assert.equal(dayEndMillis('2026-09-30'), Date.parse('2026-09-30T23:59:59.999Z'));
    assert.equal(dayEndMillis('bad'), null);
    assert.equal(dayEndMillis('2026-9-30'), null);
  });

  await t.test('邊界：正好在關帳日當天 → 視為已關帳', () => {
    const d = PeriodConstraint.check({ role: 'cs_agent' }, {
      amountChange: { reasonCode: 'REFUND_FULL' }, accountingClosedThrough: CLOSED, order: { completedAt: closedMs },
    });
    assert.equal(d.reason, Reason.PERIOD_CLOSED);
  });
});

test('SoDConstraint', async (t) => {
  await t.test('不同人 → 允許', () => {
    assert.equal(SoDConstraint.check({ id: 'cs-1', role: 'cs_agent' }, { refund: { requestedBy: 'cs-2' } }).allowed, true);
  });

  await t.test('⚠️ 同一人自批 → SOD_VIOLATION', () => {
    const d = SoDConstraint.check({ id: 'cs-1', role: 'cs_agent' }, { refund: { requestedBy: 'cs-1' } });
    assert.equal(d.reason, Reason.SOD_VIOLATION);
  });

  await t.test('⚠️ 沒有發起者資訊 → 拒絕（fail-closed，不能靠不填欄位繞過）', () => {
    assert.equal(SoDConstraint.check({ id: 'cs-1', role: 'cs_agent' }, {}).reason, Reason.RESOURCE_MISSING);
    assert.equal(SoDConstraint.check({ id: 'cs-1', role: 'cs_agent' }, { refund: {} }).reason, Reason.RESOURCE_MISSING);
  });

  await t.test('支援頂層 requestedBy 形式', () => {
    assert.equal(SoDConstraint.check({ id: 'cs-1', role: 'cs_agent' }, { requestedBy: 'cs-1' }).reason, Reason.SOD_VIOLATION);
  });
});
