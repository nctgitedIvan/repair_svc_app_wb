'use strict';

const { ValueObject } = require('../shared/ValueObject');
const { invariant, assertOneOf } = require('../shared/assertions');
const { CommissionRate, BP_DENOMINATOR } = require('../shared/CommissionRate');
const { Rounding } = require('@repair/shared-kernel/Money');

/**
 * ProfitSharingTerms —— 分潤條款（**下單當下凍結，之後唯讀**）。
 *
 * 這是「後台改比例不影響歷史訂單」的實作基礎（你的業務規則 4、A4 決策）。
 *
 * 不變式：
 *   1. `technicianRate + platformRate === 100%` —— 分潤絕不可無中生有或漏掉
 *   2. `base` 只能是 `SERVICE_FEE` 或 `SERVICE_FEE_PLUS_MATERIAL`
 *      （現行決策為 `SERVICE_FEE`：材料費不參與分潤，A3）
 *
 * 對應 docs/01-目標架構.md §3.6。
 */

const SharingBase = Object.freeze({
  /** 分潤基數 = 服務費（現行決策） */
  SERVICE_FEE: 'SERVICE_FEE',
  /** 分潤基數 = 服務費 + 材料費（參數化保留，改決策只需改設定） */
  SERVICE_FEE_PLUS_MATERIAL: 'SERVICE_FEE_PLUS_MATERIAL',
});

const BASES = Object.freeze(Object.values(SharingBase));
const ROUNDING_MODES = Object.freeze(Object.values(Rounding));

class ProfitSharingTerms extends ValueObject {
  /**
   * @param {object} props
   * @param {string} props.base              SharingBase 之一
   * @param {number} props.technicianRateBp  basis point
   * @param {number} props.platformRateBp    basis point
   * @param {string} props.roundingMode      Rounding 之一
   * @param {string} props.termsVersion      條款版本，供日後追溯
   */
  constructor(props) {
    assertOneOf(props.base, BASES, 'ProfitSharingTerms.base');
    assertOneOf(props.roundingMode, ROUNDING_MODES, 'ProfitSharingTerms.roundingMode');

    const technician = CommissionRate.fromBp(props.technicianRateBp);
    const platform = CommissionRate.fromBp(props.platformRateBp);

    invariant(
      technician.addUpTo100(platform),
      `分潤比例總和必須為 ${BP_DENOMINATOR} bp（100%），` +
        `收到 ${props.technicianRateBp} + ${props.platformRateBp}`,
      { technicianRateBp: props.technicianRateBp, platformRateBp: props.platformRateBp },
    );

    super({
      base: props.base,
      technicianRateBp: technician.bp,
      platformRateBp: platform.bp,
      roundingMode: props.roundingMode,
      termsVersion: props.termsVersion,
    });
  }

  get base() {
    return this.props.base;
  }

  get technicianRateBp() {
    return this.props.technicianRateBp;
  }

  get platformRateBp() {
    return this.props.platformRateBp;
  }

  get roundingMode() {
    return this.props.roundingMode;
  }

  get termsVersion() {
    return this.props.termsVersion;
  }

  /** 材料費是否參與分潤（現行決策為 false） */
  get includesMaterialFee() {
    return this.props.base === SharingBase.SERVICE_FEE_PLUS_MATERIAL;
  }

  get technicianRate() {
    return CommissionRate.fromBp(this.props.technicianRateBp);
  }

  get platformRate() {
    return CommissionRate.fromBp(this.props.platformRateBp);
  }

  toJSON() {
    return this.props;
  }
}

module.exports = { ProfitSharingTerms, SharingBase, BASES };
