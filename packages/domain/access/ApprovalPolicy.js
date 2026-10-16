'use strict';

const { Decision, Reason } = require('./Decision');

/**
 * ApprovalPolicy —— 敏感操作的雙人覆核。
 *
 * 需要覆核的操作（docs/P2-計畫.md §C-3）：
 *   - 變更分潤比例
 *   - 改商品／服務價**超過 20%**
 *   - 作廢訂單（客服發起 + 管理員確認）
 *   - 變更管理員權限（需另一位超級管理員確認，Q-D）
 *
 * ## 單人例外（Q8 定案）
 *
 * 初期可能只有一名管理員。此時走「**單人 + 強制留痕 + 24 小時冷卻期**」：
 *   - 操作**立即生效**（Q13 定案：延後 24h 業務無法運作）
 *   - 24 小時內若有第二人加入，**可被推翻**
 *   - 已下單訂單按**快照價**履約，差價由平台承擔
 *   - `approval_records` 標記為「單人例外」
 *
 * ⚠️ **這是過渡方案，不是永久設計。** 有第二位管理員之後應改回嚴格雙人。
 *    程式碼與文件中都必須維持這個標記，否則它會變成永久後門。
 */

const COOLING_PERIOD_HOURS = 24;
const PRICE_CHANGE_THRESHOLD_PERCENT = 20;

/** 權限 → 覆核規則 */
const APPROVAL_RULES = Object.freeze({
  'profit_terms.manage': Object.freeze({ approvers: 2, label: '變更分潤比例' }),
  'catalog.manage': Object.freeze({
    approvers: 2,
    label: '改價超過 20%',
    /** 條件式：只有超過門檻才需要覆核 */
    condition: (resource) => isPriceChangeOverThreshold(resource.priceChange),
  }),
  'orders.void': Object.freeze({
    approvers: 2,
    label: '作廢訂單',
    /** 需來自不同角色的確認（客服發起 + 管理員確認） */
    requireDistinctRoles: true,
  }),
  'users.manage_role': Object.freeze({ approvers: 2, label: '變更管理員權限', requireSuperAdmin: true }),
});

/**
 * 價格變動是否超過門檻。
 *
 * 基準 = **該商品上一次的定價**（Q11 定案），不是成本價。
 *
 * @param {{ previousCents: number, newCents: number }} priceChange
 */
function isPriceChangeOverThreshold(priceChange) {
  if (!priceChange) return false;
  const { previousCents, newCents } = priceChange;
  if (!Number.isInteger(previousCents) || !Number.isInteger(newCents)) return false;
  if (previousCents <= 0) return true; // 從 0 變成有價 → 視為重大變動
  const percent = Math.abs((newCents - previousCents) / previousCents) * 100;
  return percent > PRICE_CHANGE_THRESHOLD_PERCENT;
}

/** 這個權限在此資源上是否需要覆核？ */
function requiresApproval(permissionKey, resource = {}) {
  const rule = APPROVAL_RULES[permissionKey];
  if (!rule) return false;
  if (rule.condition && !rule.condition(resource)) return false;
  return true;
}

/**
 * 單人例外是否成立。
 *
 * @param {object} exception `{ grantedAt, coolingHours? }`
 * @param {number} now Unix 毫秒
 */
function isSingleAdminExceptionEffective(exception, now) {
  if (!exception || !Number.isInteger(exception.grantedAt)) return false;
  if (!Number.isInteger(now)) return false;
  const coolingHours = Number.isInteger(exception.coolingHours) ? exception.coolingHours : COOLING_PERIOD_HOURS;
  return now >= exception.grantedAt;
}

const ApprovalPolicy = Object.freeze({
  name: 'ApprovalPolicy',

  /**
   * 作為 constraint 使用（由 `AccessPolicy` 呼叫）。
   *
   * @param {{ id: string, role: string, isSuper?: boolean }} actor
   * @param {object} resource
   *   - `approvals: [{ by, role, isSuper, at }]` 已有的覆核紀錄
   *   - `priceChange`（catalog.manage 用）
   *   - `singleAdminException: { grantedAt }`（單人例外）
   * @param {{ permissionKey: string, now?: number }} context
   */
  check(actor, resource = {}, context = {}) {
    const permissionKey = context.permissionKey;
    const rule = APPROVAL_RULES[permissionKey];

    if (!rule) return Decision.allow();
    if (rule.condition && !rule.condition(resource)) return Decision.allow();

    const approvals = Array.isArray(resource.approvals) ? resource.approvals : [];

    // 排除自己 —— 自己不能覆核自己
    const others = approvals.filter((a) => a && a.by && a.by !== actor.id);

    // 若要求不同角色，檢查是否已有「非自己角色」的覆核
    const counted = rule.requireDistinctRoles
      ? others.filter((a) => a.role && a.role !== actor.role)
      : others;

    const distinctApprovers = new Set(counted.map((a) => a.by));
    const need = Math.max(1, (rule.approvers || 2) - 1); // 扣掉自己這一次

    if (distinctApprovers.size >= need) {
      if (rule.requireSuperAdmin && !counted.some((a) => a.isSuper)) {
        return Decision.deny(Reason.APPROVAL_REQUIRED, {
          action: permissionKey, label: rule.label, hint: '需要超級管理員的覆核',
        });
      }
      return Decision.allow();
    }

    // 單人例外（過渡方案）
    const now = Number.isInteger(context.now) ? context.now : null;
    if (resource.singleAdminException && isSingleAdminExceptionEffective(resource.singleAdminException, now)) {
      return Decision.allow();
    }

    return Decision.deny(Reason.APPROVAL_REQUIRED, {
      action: permissionKey,
      label: rule.label,
      haveApprovers: distinctApprovers.size,
      needApprovers: need,
      hint: '需要另一位管理員覆核；若目前只有一位管理員，走單人例外路徑（24h 冷卻期）',
    });
  },
});

module.exports = {
  ApprovalPolicy,
  APPROVAL_RULES,
  COOLING_PERIOD_HOURS,
  PRICE_CHANGE_THRESHOLD_PERCENT,
  isPriceChangeOverThreshold,
  requiresApproval,
  isSingleAdminExceptionEffective,
};
