'use strict';

const { Money } = require('@repair/shared-kernel/Money');
const { Decision, Reason } = require('../Decision');

/**
 * AmountConstraint —— 金額三重檢查。
 *
 * | # | 檢查 | 適用對象 |
 * |---|---|---|
 * | ① | 單筆門檻（預設 200 元） | 客服；**admin 跳過** |
 * | ② | 當日累計配額 | 客服；**admin 跳過** |
 * | ③ | **不得超過已付未退** | 🔴 **所有角色，含 `admin.full`** |
 *
 * ③ 是**硬上限**，不是權限問題 —— 它是會計恆等式（退款不可能超過收款）。
 * 任何角色都不該有「退比收多」的能力。
 *
 * ⚠️ **fail-closed**：讀不到當日配額時**拒絕**，不是放行。
 *
 * 對應 docs/01 §4.7.6 範例 2。
 */

const DEFAULT_SINGLE_LIMIT_CENTS = 20000; // 200.00 元
const DEFAULT_DAILY_QUOTA_CENTS = 100000; // 1000.00 元／客服／日

const AmountConstraint = Object.freeze({
  name: 'AmountConstraint',

  /**
   * @param {{ role: string, dailyRefundBudget?: { usedCents: number, limitCents: number } }} actor
   * @param {object} resource
   *   - `requestedRefundCents`（必填）
   *   - `order`（可選，但**強烈建議**提供，否則 ③ 無從檢查）
   *   - `singleLimitCents` / `dailyQuotaCents`（可選，由 system_configs 注入）
   */
  check(actor, resource = {}) {
    const {
      requestedRefundCents,
      order,
      singleLimitCents = DEFAULT_SINGLE_LIMIT_CENTS,
      dailyQuotaCents = DEFAULT_DAILY_QUOTA_CENTS,
    } = resource;

    if (!Number.isInteger(requestedRefundCents)) {
      return Decision.deny(Reason.INVALID_AMOUNT, { requestedRefundCents });
    }
    if (requestedRefundCents <= 0) {
      return Decision.deny(Reason.AMOUNT_NOT_POSITIVE, { requestedRefundCents });
    }

    // ③ 硬上限：所有角色皆適用，**含 admin**
    if (order) {
      const paid = Money.fromCents(order.paidCents || 0);
      const refunded = Money.fromCents(order.refundedCents || 0);
      const refundable = paid.subtract(refunded);

      if (refundable.isNegative() || refundable.isLessThan(Money.fromCents(requestedRefundCents))) {
        return Decision.deny(Reason.EXCEEDS_PAID_AMOUNT, {
          requested: requestedRefundCents,
          refundableCents: refundable.cents,
        });
      }
    }

    // admin（含 admin.full）只需要過 ③ —— 門檻與配額是「客服的授權上限」
    if (actor.role === 'admin') return Decision.allow();

    // ① 單筆門檻
    if (requestedRefundCents > singleLimitCents) {
      return Decision.deny(Reason.EXCEEDS_SINGLE_LIMIT, {
        requested: requestedRefundCents, limit: singleLimitCents,
      });
    }

    // ② 當日累計配額 —— 讀不到就拒絕（fail-closed）
    const budget = actor.dailyRefundBudget;
    if (!budget || typeof budget.usedCents !== 'number' || typeof budget.limitCents !== 'number') {
      return Decision.deny(Reason.DAILY_BUDGET_UNAVAILABLE, {
        hint: '無法確認當日配額時一律拒絕，不接受在未知狀態下放行',
      });
    }
    // 配額也可能被 system_configs 收緊
    const effectiveLimit = Math.min(budget.limitCents, dailyQuotaCents);
    if (budget.usedCents + requestedRefundCents > effectiveLimit) {
      return Decision.deny(Reason.EXCEEDS_DAILY_QUOTA, {
        usedToday: budget.usedCents,
        requested: requestedRefundCents,
        quota: effectiveLimit,
      });
    }

    return Decision.allow();
  },
});

module.exports = { AmountConstraint, DEFAULT_SINGLE_LIMIT_CENTS, DEFAULT_DAILY_QUOTA_CENTS };
