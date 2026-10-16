'use strict';

const { Money } = require('@repair/shared-kernel/Money');
const { invariant, assertArray } = require('../shared/assertions');

/**
 * PricingService —— 由明細計算金額。**純函式**。
 *
 * 不變式：**服務費 + 材料費 === 總額**（不得因取整而漏錢或多錢）。
 * 做法：總額 = 所有明細小計的加總；服務費／材料費 = 依 `feeType` 分組加總。
 * 因為三者都是「同一組數字的加總」，不涉及乘除取整，所以必然相等。
 *
 * ⚠️ 定價**不含折扣**：本階段沒有優惠券（已下線）。若日後加回，
 *    必須明確規定「折扣歸屬哪一類費用」，否則退款與分潤都會算錯。
 */

/**
 * @param {Array<{amount: Money, isServiceFee(): boolean, isMaterialFee(): boolean}>} items
 * @returns {{ serviceFee: Money, materialFee: Money, total: Money, currency: string }}
 */
function priceItems(items) {
  assertArray(items, 'items');
  invariant(items.length > 0, '訂單至少要有一個明細');

  const currency = items[0].amount.currency;

  let serviceFee = Money.zero(currency);
  let materialFee = Money.zero(currency);

  for (const item of items) {
    const amount = item.amount;
    invariant(
      amount.currency === currency,
      '同一訂單的明細幣別必須一致',
      { expected: currency, actual: amount.currency },
    );

    if (item.isServiceFee()) {
      serviceFee = serviceFee.add(amount);
    } else if (item.isMaterialFee()) {
      materialFee = materialFee.add(amount);
    } else {
      invariant(false, '明細的 feeType 必須是 SERVICE_FEE 或 MATERIAL_FEE');
    }
  }

  const total = serviceFee.add(materialFee);

  // 自我檢查：這條在數學上必然成立，寫出來是為了在日後有人改動分組邏輯時立刻攔下
  invariant(
    total.cents === items.reduce((sum, i) => sum + i.amount.cents, 0),
    '定價不變式被破壞：服務費 + 材料費 不等於明細加總',
    { serviceFee: serviceFee.cents, materialFee: materialFee.cents, total: total.cents },
  );

  return { serviceFee, materialFee, total, currency };
}

/**
 * 依 `RefundScope` 從明細計算可退金額（**不做上限檢查** —— 那是 `RefundPolicy` 的職責）。
 *
 * @param {Array} items
 * @param {(item: object) => boolean} predicate 挑選要退的明細
 */
function sumItemsWhere(items, predicate) {
  assertArray(items, 'items');
  if (items.length === 0) return Money.zero();

  let sum = Money.zero(items[0].amount.currency);
  for (const item of items) {
    if (predicate(item)) sum = sum.add(item.amount);
  }
  return sum;
}

module.exports = { priceItems, sumItemsWhere };
