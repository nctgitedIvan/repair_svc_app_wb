'use strict';

const { ValueObject } = require('../shared/ValueObject');
const { invariant, assertNonEmptyString } = require('../shared/assertions');
const { ProfitSharingTerms } = require('../settlement/ProfitSharingTerms');

/**
 * OrderSnapshot —— 下單當下**凍結**的條款。
 *
 * 這是「後台改比例不影響歷史訂單」的實作基礎（你的業務規則 4、A4 決策）。
 * 分潤計算一律讀這裡，**永不回查當前配置**。
 *
 * 不可變：值物件本身即凍結，且 `ProfitSharingTerms` 也是。
 */
class OrderSnapshot extends ValueObject {
  /**
   * @param {object} props
   * @param {ProfitSharingTerms} props.profitSharingTerms
   * @param {string} props.pricingVersion 定價版本（供日後追溯定價規則的變更）
   */
  constructor(props) {
    invariant(
      props.profitSharingTerms instanceof ProfitSharingTerms,
      'OrderSnapshot.profitSharingTerms 必須是 ProfitSharingTerms',
    );
    assertNonEmptyString(props.pricingVersion, 'OrderSnapshot.pricingVersion');

    super({
      profitSharingTerms: props.profitSharingTerms,
      pricingVersion: props.pricingVersion,
    });
  }

  get profitSharingTerms() {
    return this.props.profitSharingTerms;
  }

  get pricingVersion() {
    return this.props.pricingVersion;
  }

  /** 師傅分潤比例（basis point），供計算時直接取用 */
  get technicianRateBp() {
    return this.props.profitSharingTerms.technicianRateBp;
  }

  toJSON() {
    return {
      profitSharingTerms: this.props.profitSharingTerms,
      pricingVersion: this.props.pricingVersion,
    };
  }
}

module.exports = { OrderSnapshot };
