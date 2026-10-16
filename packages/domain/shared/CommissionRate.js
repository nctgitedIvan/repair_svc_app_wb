'use strict';

const { ValueObject } = require('./ValueObject');
const { invariant, assertInteger } = require('./assertions');

/**
 * CommissionRate —— 分潤比例（basis point 整數）。
 *
 * 為什麼用 basis point 而不是小數：
 *   0.8 這種小數在 JS 是浮點，與 `Money` 相乘會產生誤差。
 *   8000 bp 是整數，運算全程無浮點。
 *
 * 為什麼要獨立成值物件：分潤比例是**會被快照到訂單上**的關鍵參數
 * （見 `ProfitSharingTerms`）。用整數包起來可以防止「0.8 還是 80 還是 8000」
 * 這類單位混淆 —— 那是金流系統的典型事故。
 */
const BP_DENOMINATOR = 10000;

class CommissionRate extends ValueObject {
  constructor(bp) {
    assertInteger(bp, 'CommissionRate', { min: 0, max: BP_DENOMINATOR });
    super({ bp });
  }

  static fromBp(bp) {
    return new CommissionRate(bp);
  }

  /** 從百分比建立（80 → 8000 bp）。只建議在設定檔解析時使用。 */
  static fromPercent(percent) {
    invariant(
      typeof percent === 'number' && Number.isFinite(percent),
      'CommissionRate.fromPercent 需要有限數字',
      { received: percent },
    );
    const bp = Math.round(percent * 100);
    return new CommissionRate(bp);
  }

  get bp() {
    return this.props.bp;
  }

  /** 供顯示：80 */
  get percent() {
    return this.props.bp / 100;
  }

  isZero() {
    return this.props.bp === 0;
  }

  /** 互補比例（例如師傅 80% → 平台 20%） */
  complement() {
    return new CommissionRate(BP_DENOMINATOR - this.props.bp);
  }

  /**
   * 校驗兩者相加為 100%。
   * 用於 `ProfitSharingTerms` 的不變式 —— 分潤絕不可「無中生有」或「漏掉」。
   */
  addUpTo100(other) {
    invariant(other instanceof CommissionRate, 'CommissionRate.addUpTo100 需要 CommissionRate');
    return this.props.bp + other.props.bp === BP_DENOMINATOR;
  }

  toJSON() {
    return { bp: this.props.bp };
  }
}

module.exports = { CommissionRate, BP_DENOMINATOR };
