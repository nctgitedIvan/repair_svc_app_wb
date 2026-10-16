'use strict';

const { Decision, Reason } = require('../Decision');
const { ReasonCode } = require('../../audit/AmountChangeReason');

/**
 * PeriodConstraint —— 財務期間關帳。
 *
 * 已關帳期間的訂單**不得再修改金額**（docs/01 §4.7.8 / `docs/P2-計畫.md` §B-4）。
 *
 * **唯一例外：沖銷（REVERSAL）。**
 * 沖銷是「用一筆反向分錄修正錯誤」的會計做法，它本身就是為了處理
 * 「已關帳但發現錯誤」而存在的。若沖銷也被擋，財報錯誤將永遠無法修正。
 *
 * 判定方式：只有當 `resource.amountChange` **存在**時才檢查 ——
 * 讀取類操作、狀態流轉（不改金額）不受影響。
 */
const PeriodConstraint = Object.freeze({
  name: 'PeriodConstraint',

  /**
   * @param {{ role: string }} actor
   * @param {object} resource
   *   - `amountChange: { reasonCode, amountCents }`（**有此欄位才觸發檢查**）
   *   - `accountingClosedThrough: string`（'YYYY-MM-DD'）
   *   - `order.completedAt` 或 `order.createdAt`（判斷該訂單屬於哪個期間）
   */
  check(actor, resource = {}) {
    const { amountChange, accountingClosedThrough, order } = resource;

    // 不改金額 → 不受期間限制
    if (!amountChange) return Decision.allow();

    if (!accountingClosedThrough) {
      // 沒有關帳設定 → 視為未關帳（這是設定缺失，不是安全問題；
      // 真正的安全問題是「不該改的金額被改」，那由其他 constraint 管）
      return Decision.allow();
    }

    // 沖銷是關帳期間唯一允許的金額變更
    if (amountChange.reasonCode === ReasonCode.REVERSAL) {
      return Decision.allow();
    }

    if (!amountChange.reasonCode) {
      return Decision.deny(Reason.RESOURCE_MISSING, { need: 'amountChange.reasonCode' });
    }

    if (!order) {
      // 有金額變更但不知道是哪張訂單 → 無法判斷是否落在關帳期間 → 拒絕
      return Decision.deny(Reason.RESOURCE_MISSING, { need: 'order' });
    }

    const effectiveAt = order.completedAt || order.createdAt;
    if (!Number.isInteger(effectiveAt)) {
      return Decision.deny(Reason.RESOURCE_MISSING, { need: 'order.completedAt 或 order.createdAt' });
    }

    const closedThroughMs = dayEndMillis(accountingClosedThrough);
    if (closedThroughMs === null) {
      return Decision.deny(Reason.RESOURCE_MISSING, { need: '合法的 accountingClosedThrough（YYYY-MM-DD）' });
    }

    if (effectiveAt <= closedThroughMs) {
      return Decision.deny(Reason.PERIOD_CLOSED, {
        closedThrough: accountingClosedThrough,
        orderEffectiveAt: effectiveAt,
        reasonCode: amountChange.reasonCode,
        hint: '已關帳期間只能用沖銷（reasonCode=REVERSAL）修正',
      });
    }

    return Decision.allow();
  },
});

/**
 * 把 'YYYY-MM-DD' 轉為該日 23:59:59.999 的 Unix 毫秒。
 *
 * 用 UTC 解析以避免伺服器時區不同導致判定不一致
 * （財報期間是**業務定義**，不該隨執行環境漂移）。
 */
function dayEndMillis(dateStr) {
  if (typeof dateStr !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return null;
  const ms = Date.parse(`${dateStr}T23:59:59.999Z`);
  return Number.isNaN(ms) ? null : ms;
}

module.exports = { PeriodConstraint, dayEndMillis };
