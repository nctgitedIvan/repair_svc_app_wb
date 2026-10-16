'use strict';

const { Money } = require('@repair/shared-kernel/Money');
const { invariant, assertInteger, assertArray } = require('../shared/assertions');

/**
 * RefundPolicy —— **能不能退、退多少**。
 *
 * 與 `RefundScope` 的分工：Scope 回答「退什麼」，Policy 回答「能不能退」。
 *
 * 檢查順序（任一不過即拒絕）：
 *   1. 範圍必須至少涵蓋一個明細項（否則金額為 0）
 *   2. **累計退款不得超過已付金額**（硬上限）
 *   3. **單筆訂單退款次數不得超過上限**（微信支付的部分退款次數限制）
 *
 * ⚠️ **財務關帳期間的檢查不在這裡** —— 那是 `PeriodConstraint`（存取控制層）。
 *    本政策只管「金額上可不可行」。
 *
 * **純函式**：`lastRefundSeq` 由呼叫方從 `refund_records` 讀出後傳入。
 *
 * 對應 docs/01 §3.1、A6、Q10。
 */

/** 微信支付對單筆訂單的部分退款次數限制（**需人工核對官方文檔**） */
const DEFAULT_MAX_REFUND_COUNT = 50;

/**
 * 計算退款計畫。
 *
 * @param {object} params
 * @param {object} params.order 需含 `items`、`paidCents`（或 `amounts.total`）
 * @param {import('./RefundScope').RefundScope} params.scope
 * @param {number} [params.alreadyRefundedCents] 已退累計
 * @param {number} [params.refundCount] 已發起的退款筆數
 * @param {number} [params.maxRefundCount]
 * @returns {{ ok: true, amountCents: number, currency: string, breakdown: object[] }
 *          | { ok: false, reason: string, details: object }}
 */
function planRefund({
  order,
  scope,
  alreadyRefundedCents = 0,
  refundCount = 0,
  maxRefundCount = DEFAULT_MAX_REFUND_COUNT,
}) {
  invariant(order, 'planRefund 需要 order');
  invariant(scope, 'planRefund 需要 scope');
  assertInteger(alreadyRefundedCents, 'alreadyRefundedCents', { min: 0 });
  assertInteger(refundCount, 'refundCount', { min: 0 });

  const items = order.items || [];
  assertArray(items, 'order.items');

  // ① 挑出範圍內的明細
  const picked = [];
  items.forEach((item, index) => {
    if (scope.includes(item, index)) picked.push({ index, item });
  });

  if (picked.length === 0) {
    return { ok: false, reason: 'EMPTY_SCOPE', details: { scopeType: scope.type } };
  }

  const currency = picked[0].item.amount.currency;
  let amount = Money.zero(currency);
  const breakdown = [];

  for (const { index, item } of picked) {
    const itemAmount = item.amount;
    invariant(
      itemAmount.currency === currency,
      '同一訂單的明細幣別必須一致',
      { expected: currency, actual: itemAmount.currency },
    );
    amount = amount.add(itemAmount);
    breakdown.push({
      index,
      itemType: item.itemType,
      nameSnapshot: item.nameSnapshot,
      feeType: item.feeType,
      amountCents: itemAmount.cents,
    });
  }

  const paidCents = resolvePaidCents(order);
  const refundableCents = paidCents - alreadyRefundedCents;

  // ② 累計硬上限
  if (amount.cents > refundableCents) {
    return {
      ok: false,
      reason: 'EXCEEDS_REFUNDABLE',
      details: {
        requestedCents: amount.cents,
        paidCents,
        alreadyRefundedCents,
        refundableCents: Math.max(0, refundableCents),
      },
    };
  }

  // ③ 次數上限
  if (refundCount >= maxRefundCount) {
    return {
      ok: false,
      reason: 'MAX_REFUND_COUNT_REACHED',
      details: { refundCount, maxRefundCount },
    };
  }

  return {
    ok: true,
    amountCents: amount.cents,
    currency,
    breakdown,
    refundableCentsAfter: refundableCents - amount.cents,
  };
}

/**
 * 已付金額。
 * 優先取 `order.paidCents`（持久化欄位）；否則用 `amounts.total`。
 */
function resolvePaidCents(order) {
  if (Number.isInteger(order.paidCents)) return order.paidCents;
  if (order.amounts && order.amounts.total instanceof Money) return order.amounts.total.cents;
  invariant(false, 'planRefund 無法取得已付金額（需 order.paidCents 或 order.amounts.total）');
  return 0;
}

/**
 * 預覽各範圍的金額（供客服 UI 顯示選項）。
 *
 * ⚠️ 回傳的是**各範圍各自涵蓋多少錢**（`amounts`）與**目前還能退多少**（`refundableCents`），
 *    **不是**把兩者混在一起的單一數字。
 *
 * 為什麼刻意分開：假設服務費 100 元、材料費 25 元，已退 110 元。
 * 此時「還能退 15 元」—— 但那 15 元其實是材料費的殘值，
 * 若把它顯示成「只退服務費 = 15 元」會**誤導客服**（服務費早就退完了）。
 *
 * 正確用法：UI 應以 `amounts` 顯示各選項的金額，
 * 並在 `amounts[X] > refundableCents` 時**停用**該選項（而非顯示一個被壓縮過的數字）。
 *
 * @returns {{ amounts: { SERVICE_ONLY: number, MATERIAL_ONLY: number, FULL: number },
 *             refundableCents: number, paidCents: number, alreadyRefundedCents: number }}
 */
function previewAmounts({ order, alreadyRefundedCents = 0 }) {
  const paidCents = resolvePaidCents(order);
  const refundableCents = Math.max(0, paidCents - alreadyRefundedCents);
  const { RefundScope } = require('./RefundScope');

  return {
    amounts: {
      SERVICE_ONLY: scopeAmount(order, RefundScope.serviceOnly()),
      MATERIAL_ONLY: scopeAmount(order, RefundScope.materialOnly()),
      FULL: scopeAmount(order, RefundScope.full()),
    },
    refundableCents,
    paidCents,
    alreadyRefundedCents,
  };
}

/**
 * 某個範圍**涵蓋**的金額（**不套用可退上限**）。
 *
 * 與 `planRefund` 的差別：後者會因「超過可退」而整筆拒絕（回 0）；
 * 這裡要的是「這個範圍本身值多少錢」，供 UI 顯示與停用判斷。
 */
function scopeAmount(order, scope) {
  const items = order.items || [];
  const currency = items.length > 0 ? items[0].amount.currency : 'CNY';
  let sum = Money.zero(currency);

  items.forEach((item, index) => {
    if (scope.includes(item, index)) sum = sum.add(item.amount);
  });

  return sum.cents;
}

/** 某個範圍目前是否可選（金額未超過可退上限） */
function isScopeSelectable(preview, scopeType) {
  const amount = preview.amounts[scopeType];
  return Number.isInteger(amount) && amount > 0 && amount <= preview.refundableCents;
}

module.exports = {
  planRefund,
  previewAmounts,
  isScopeSelectable,
  scopeAmount,
  resolvePaidCents,
  DEFAULT_MAX_REFUND_COUNT,
};
