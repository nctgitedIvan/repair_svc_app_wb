'use strict';

const { ValueObject } = require('../shared/ValueObject');
const { invariant, assertOneOf } = require('../shared/assertions');

/**
 * AmountChangeReason —— 金額變更原因。
 *
 * 規則（`docs/P2-計畫.md` §B-2）：**每一筆涉及金額的寫入都必須帶原因碼**，
 * 否則稽核紀錄無法回答「這筆錢為什麼變了」—— 那是財務審查最基本的要求。
 *
 * 凍結的列舉：不接受任意字串。若需要新原因，必須改這裡並同步測試。
 */

const ReasonCode = Object.freeze({
  // ── 退款 ──
  REFUND_SERVICE_FEE: 'REFUND_SERVICE_FEE',
  REFUND_MATERIAL_FEE: 'REFUND_MATERIAL_FEE',
  REFUND_FULL: 'REFUND_FULL',
  REFUND_PARTIAL_ITEMS: 'REFUND_PARTIAL_ITEMS',
  REFUND_GOODWILL: 'REFUND_GOODWILL', // 補償性退款（客服判斷）

  // ── 分帳 ──
  PROFIT_SHARING_EXECUTED: 'PROFIT_SHARING_EXECUTED',
  PROFIT_SHARING_RETURNED: 'PROFIT_SHARING_RETURNED',

  // ── 例外處理 ──
  REVERSAL: 'REVERSAL', // 沖銷（關帳期間的唯一合法金額變更）
  PRICE_CORRECTION: 'PRICE_CORRECTION',
  RECONCILIATION_ADJUSTMENT: 'RECONCILIATION_ADJUSTMENT',

  // ── 作廢 ──
  VOID_UNPAID: 'VOID_UNPAID',
  VOID_DUPLICATE_ORDER: 'VOID_DUPLICATE_ORDER',
  VOID_TEST_ORDER: 'VOID_TEST_ORDER',
  VOID_FRAUD_SUSPECTED: 'VOID_FRAUD_SUSPECTED',
  VOID_PLATFORM_ERROR: 'VOID_PLATFORM_ERROR',
});

const ALL_CODES = Object.freeze(Object.values(ReasonCode));

class AmountChangeReason extends ValueObject {
  /**
   * @param {string} code ReasonCode 之一
   * @param {string} [note] 自由文字補充（例如詐欺案件的說明）
   */
  constructor(code, note = null) {
    assertOneOf(code, ALL_CODES, 'AmountChangeReason.code');
    invariant(
      note === null || typeof note === 'string',
      'AmountChangeReason.note 必須是字串或 null',
      { received: typeof note },
    );
    super({ code, note });
  }

  get code() {
    return this.props.code;
  }

  get note() {
    return this.props.note;
  }

  /** 是否為「錢往客戶方向走」的原因（供稽核報表分類） */
  isCustomerFacing() {
    return this.props.code.startsWith('REFUND_') || this.props.code.startsWith('VOID_');
  }

  toJSON() {
    return { code: this.props.code, note: this.props.note };
  }
}

module.exports = { AmountChangeReason, ReasonCode, ALL_CODES };
