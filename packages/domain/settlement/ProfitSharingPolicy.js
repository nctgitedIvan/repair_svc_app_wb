'use strict';

const { Money } = require('@repair/shared-kernel/Money');
const { invariant } = require('../shared/assertions');

/**
 * ProfitSharingPolicy —— 師傅報酬的計算規則。
 *
 * 決策依據（docs/01 §3.6、A3／A4）：
 *  - **分潤基數 = 服務費**（不含材料費）。材料費是平台統一定價隨單收（模式 (a)）。
 *  - 基數**參數化**：`terms.base` 改一個值即可切換為「服務費 + 材料費」，不需改程式。
 *  - 比例讀**訂單快照**（`order.snapshot`），**永不回查當前配置**。
 *
 * **純函式**：不碰 I/O、不取時間、不做狀態判斷（狀態前提由 Use Case 檢查）。
 */

const SharingBase = Object.freeze({
  SERVICE_FEE: 'SERVICE_FEE',
  SERVICE_FEE_PLUS_MATERIAL: 'SERVICE_FEE_PLUS_MATERIAL',
});

/**
 * 計算分潤基數。
 *
 * @param {{ amounts: { serviceFee: Money, materialFee: Money } }} order
 * @param {{ base: string }} terms
 * @returns {Money}
 */
function baseAmount(order, terms) {
  invariant(order && order.amounts, 'baseAmount 需要 order.amounts');
  invariant(terms && terms.base, 'baseAmount 需要 terms.base');

  switch (terms.base) {
    case SharingBase.SERVICE_FEE:
      return order.amounts.serviceFee;
    case SharingBase.SERVICE_FEE_PLUS_MATERIAL:
      return order.amounts.serviceFee.add(order.amounts.materialFee);
    default:
      invariant(false, `未知的分潤基數：${terms.base}`);
      return null; // 到不了
  }
}

/**
 * 計算師傅與平台的份額。
 *
 * **不變式**：`technicianShare + platformShare === base`（不得因取整而漏錢）。
 * 做法：平台份額 = 基數 − 師傅份額，而不是各自算一次比例。
 *
 * @returns {{ base: Money, technicianShare: Money, platformShare: Money, currency: string, termsVersion: string }}
 */
function calculate({ order, terms }) {
  const base = baseAmount(order, terms);

  const technicianShare = base.applyRate(terms.technicianRateBp, terms.roundingMode);
  const platformShare = base.subtract(technicianShare);

  invariant(
    technicianShare.add(platformShare).cents === base.cents,
    '分潤不變式被破壞：師傅 + 平台 != 基數',
  );

  return {
    base,
    technicianShare,
    platformShare,
    currency: base.currency,
    termsVersion: terms.termsVersion,
  };
}

/** 便利方法：只取師傅份額 */
function technicianShareOf(order, terms) {
  return calculate({ order, terms }).technicianShare;
}

module.exports = { calculate, baseAmount, technicianShareOf, SharingBase };
