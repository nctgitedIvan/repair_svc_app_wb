'use strict';

/**
 * ApprovalPolicy 測試。
 *
 * 兩條主軸：
 *   1. 雙人覆核（同人不得自覆核）
 *   2. **單人例外是過渡方案** —— 測試要固定它的行為，避免它悄悄變成永久後門
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  ApprovalPolicy, APPROVAL_RULES, COOLING_PERIOD_HOURS, PRICE_CHANGE_THRESHOLD_PERCENT,
  isPriceChangeOverThreshold, requiresApproval, isSingleAdminExceptionEffective,
} = require('../../../../packages/domain/access/ApprovalPolicy');
const { Decision, Reason } = require('../../../../packages/domain/access/Decision');

const ADMIN_A = { id: 'a-1', role: 'admin', isSuper: true };
const ADMIN_B = { id: 'a-2', role: 'admin', isSuper: true };
const CS = { id: 'cs-1', role: 'cs_agent' };
const ctx = (k, now) => ({ permissionKey: k, now });

test('規則表', async (t) => {
  await t.test('四個敏感操作都有規則', () => {
    assert.deepEqual(
      Object.keys(APPROVAL_RULES).sort(),
      ['catalog.manage', 'orders.void', 'profit_terms.manage', 'users.manage_role'],
    );
  });

  await t.test('未登記的操作不需覆核', () => {
    assert.equal(ApprovalPolicy.check(ADMIN_A, {}, ctx('orders.read')).allowed, true);
  });

  await t.test('兩份清單不得走鐘：每一條規則的 label 都要有', () => {
    for (const [key, rule] of Object.entries(APPROVAL_RULES)) {
      assert.ok(rule.label, `${key} 缺少 label`);
      assert.ok(rule.approvers >= 2, `${key} 的 approvers 應至少 2`);
    }
  });
});

test('價格變更門檻（Q11：基準 = 該商品上一次定價）', async (t) => {
  await t.test('20% 邊界', () => {
    assert.equal(isPriceChangeOverThreshold({ previousCents: 10000, newCents: 12000 }), false, '剛好 20% 不算超過');
    assert.equal(isPriceChangeOverThreshold({ previousCents: 10000, newCents: 12001 }), true);
    assert.equal(isPriceChangeOverThreshold({ previousCents: 10000, newCents: 8000 }), false, '降價 20% 亦不超過');
    assert.equal(isPriceChangeOverThreshold({ previousCents: 10000, newCents: 7999 }), true, '降超過 20% 要覆核');
  });

  await t.test('⚠️ 從 0 變成有價 → 視為重大變動', () => {
    assert.equal(isPriceChangeOverThreshold({ previousCents: 0, newCents: 100 }), true);
  });

  await t.test('無 priceChange 或格式錯誤 → 不觸發', () => {
    assert.equal(isPriceChangeOverThreshold(undefined), false);
    assert.equal(isPriceChangeOverThreshold({ previousCents: 'x', newCents: 1 }), false);
  });

  await t.test('requiresApproval 是條件式的', () => {
    assert.equal(requiresApproval('catalog.manage', { priceChange: { previousCents: 10000, newCents: 10500 } }), false);
    assert.equal(requiresApproval('catalog.manage', { priceChange: { previousCents: 10000, newCents: 20000 } }), true);
    assert.equal(requiresApproval('profit_terms.manage', {}), true, '無條件規則');
  });
});

test('雙人覆核', async (t) => {
  await t.test('⚠️ 自己不能覆核自己', () => {
    const d = ApprovalPolicy.check(ADMIN_A, { approvals: [{ by: 'a-1' }] }, ctx('profit_terms.manage'));
    assert.equal(d.reason, Reason.APPROVAL_REQUIRED);
  });

  await t.test('有另一位管理員的覆核 → 允許', () => {
    const d = ApprovalPolicy.check(ADMIN_A, { approvals: [{ by: 'a-2' }] }, ctx('profit_terms.manage'));
    assert.equal(d.allowed, true);
  });

  await t.test('沒有任何覆核 → 要求覆核，且帶出還缺幾人', () => {
    const d = ApprovalPolicy.check(ADMIN_A, {}, ctx('profit_terms.manage'));
    assert.equal(d.reason, Reason.APPROVAL_REQUIRED);
    assert.equal(d.details.haveApprovers, 0);
    assert.equal(d.details.needApprovers, 1);
    assert.equal(d.details.label, '變更分潤比例');
  });

  await t.test('重複的覆核者只算一次', () => {
    const d = ApprovalPolicy.check(ADMIN_A, { approvals: [{ by: 'a-2' }, { by: 'a-2' }] }, ctx('profit_terms.manage'));
    assert.equal(d.allowed, true, '一人一次就夠（approvers=2 表示「連自己共兩人」）');
  });

  await t.test('格式錯誤的覆核紀錄被忽略', () => {
    const d = ApprovalPolicy.check(ADMIN_A, { approvals: [null, {}, { by: null }, { by: 'a-1' }] }, ctx('profit_terms.manage'));
    assert.equal(d.reason, Reason.APPROVAL_REQUIRED);
  });
});

test('作廢訂單需不同角色（客服發起 + 管理員確認）', async (t) => {
  await t.test('客服發起、管理員確認 → 允許', () => {
    assert.equal(ApprovalPolicy.check(ADMIN_A, { approvals: [{ by: 'cs-2', role: 'cs_agent' }] }, ctx('orders.void')).allowed, true);
  });

  await t.test('⚠️ 同角色的覆核不算（管理員不能自己確認自己發起的作廢）', () => {
    const d = ApprovalPolicy.check(ADMIN_A, { approvals: [{ by: 'a-2', role: 'admin' }] }, ctx('orders.void'));
    assert.equal(d.reason, Reason.APPROVAL_REQUIRED);
  });

  await t.test('客服確認、管理員發起 → 允許', () => {
    assert.equal(ApprovalPolicy.check(CS, { approvals: [{ by: 'a-2', role: 'admin' }] }, ctx('orders.void')).allowed, true);
  });
});

test('管理員權限變更需超級管理員覆核（Q-D）', async (t) => {
  await t.test('有超級管理員覆核 → 允許', () => {
    assert.equal(
      ApprovalPolicy.check(ADMIN_A, { approvals: [{ by: 'a-2', isSuper: true }] }, ctx('users.manage_role')).allowed,
      true,
    );
  });

  await t.test('⚠️ 一般管理員的覆核不算', () => {
    const d = ApprovalPolicy.check(ADMIN_A, { approvals: [{ by: 'a-2', isSuper: false }] }, ctx('users.manage_role'));
    assert.equal(d.reason, Reason.APPROVAL_REQUIRED);
    assert.match(d.details.hint, /超級管理員/);
  });
});

test('⚠️ 單人例外（過渡方案，Q8／Q13）', async (t) => {
  const NOW = 1_700_000_000_000;

  await t.test('冷卻期已過 → 允許', () => {
    const d = ApprovalPolicy.check(ADMIN_A, { singleAdminException: { grantedAt: NOW - 1000 } }, ctx('profit_terms.manage', NOW));
    assert.equal(d.allowed, true);
  });

  await t.test('沒有例外 → 仍要求覆核', () => {
    assert.equal(ApprovalPolicy.check(ADMIN_A, {}, ctx('profit_terms.manage', NOW)).reason, Reason.APPROVAL_REQUIRED);
  });

  await t.test('⚠️ 例外格式不完整 → 不生效（不能靠塞半個物件繞過）', () => {
    assert.equal(isSingleAdminExceptionEffective({}, NOW), false);
    assert.equal(isSingleAdminExceptionEffective({ grantedAt: 'x' }, NOW), false);
    assert.equal(isSingleAdminExceptionEffective({ grantedAt: NOW }, null), false);
    assert.equal(isSingleAdminExceptionEffective(null, NOW), false);
  });

  await t.test('⚠️ 這是立即生效（Q13 定案：延後 24h 業務無法運作）', () => {
    // 文件與程式碼都必須維持「過渡方案」的標記，否則它會變成永久後門
    assert.equal(COOLING_PERIOD_HOURS, 24);
    assert.equal(PRICE_CHANGE_THRESHOLD_PERCENT, 20);
  });

  await t.test('例外不適用於需要超級管理員的操作？—— 目前仍適用，但需覆核紀錄留痕', () => {
    // 這是刻意的取捨：若超級管理員只有一位，不給例外會讓管理員管理完全停擺。
    // 留痕由 approval_records 負責（P5）。
    const d = ApprovalPolicy.check(ADMIN_A, { singleAdminException: { grantedAt: NOW - 1 } }, ctx('users.manage_role', NOW));
    assert.equal(d.allowed, true);
  });
});

test('作為 constraint 的介面一致性', async (t) => {
  await t.test('有 name 與 check（與其他 constraint 相同形狀）', () => {
    assert.equal(ApprovalPolicy.name, 'ApprovalPolicy');
    assert.equal(typeof ApprovalPolicy.check, 'function');
  });

  await t.test('check 回傳 Decision', () => {
    assert.ok(ApprovalPolicy.check(ADMIN_A, {}, ctx('profit_terms.manage')) instanceof Decision);
  });

  await t.test('缺 permissionKey → 視為無規則（由 AccessPolicy 保證一定會傳）', () => {
    assert.equal(ApprovalPolicy.check(ADMIN_A, {}, {}).allowed, true);
  });
});
