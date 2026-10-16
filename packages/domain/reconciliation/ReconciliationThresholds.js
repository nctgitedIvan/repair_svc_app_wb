'use strict';

const { ValueObject } = require('../shared/ValueObject');
const { invariant, assertInteger } = require('../shared/assertions');

/**
 * ReconciliationThresholds —— 對帳差異的三層閾值（Q10 定案）。
 *
 * | 層 | 預設 | 動作 |
 * |---|---|---|
 * | 1 | **單筆 > 1 元** | 寫入 `reconciliation_diffs` + 告警 |
 * | 2 | **單日累計 > 100 元** | 告警 + **通知管理員** |
 * | 3 | **單日累計 > 1000 元** | 告警 + **凍結當日結算** + 人工介入 |
 *
 * ⚠️ **第 3 層的「凍結當日結算」是真的拒絕 `ExecuteProfitSharing`**（Q14 定案），
 *    不是只告警 —— 凍結若只是告警就沒意義。這會**擋住師傅收款**，
 *    因此師傅端必須顯示「報酬待對帳確認」避免焦慮。
 *
 * 值全部來自 `system_configs`，可調整。
 */

/** 單位：分 */
const DEFAULTS = Object.freeze({
  singleCents: 100, // 1 元
  dailyCents: 10000, // 100 元
  freezeCents: 100000, // 1000 元
});

class ReconciliationThresholds extends ValueObject {
  constructor(props = {}) {
    const singleCents = props.singleCents === undefined ? DEFAULTS.singleCents : props.singleCents;
    const dailyCents = props.dailyCents === undefined ? DEFAULTS.dailyCents : props.dailyCents;
    const freezeCents = props.freezeCents === undefined ? DEFAULTS.freezeCents : props.freezeCents;

    assertInteger(singleCents, 'singleCents', { min: 0 });
    assertInteger(dailyCents, 'dailyCents', { min: 0 });
    assertInteger(freezeCents, 'freezeCents', { min: 0 });

    invariant(
      singleCents <= dailyCents && dailyCents <= freezeCents,
      '閾值必須遞增：單筆 <= 單日 <= 凍結',
      { singleCents, dailyCents, freezeCents },
    );

    super({ singleCents, dailyCents, freezeCents });
  }

  static defaults() {
    return new ReconciliationThresholds();
  }

  get singleCents() { return this.props.singleCents; }
  get dailyCents() { return this.props.dailyCents; }
  get freezeCents() { return this.props.freezeCents; }

  /**
   * 依單筆差異判斷層級。
   * @returns {0|1} 0 = 在容許範圍內
   */
  tierForSingle(diffCents) {
    const abs = Math.abs(diffCents);
    return abs > this.props.singleCents ? 1 : 0;
  }

  /**
   * 依單日累計差異判斷層級。
   * @returns {0|2|3} 0 = 正常；2 = 通知管理員；3 = 凍結結算
   */
  tierForDaily(totalDiffCents) {
    const abs = Math.abs(totalDiffCents);
    if (abs > this.props.freezeCents) return 3;
    if (abs > this.props.dailyCents) return 2;
    return 0;
  }

  toJSON() {
    return { ...this.props };
  }
}

module.exports = { ReconciliationThresholds, DEFAULTS };
