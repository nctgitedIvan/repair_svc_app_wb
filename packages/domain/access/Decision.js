'use strict';

/**
 * Decision —— 存取判斷的結果。
 *
 * **刻意不拋錯。** 權限不足是**預期結果**，不是例外：
 * 使用者做了他無權做的事，系統要回一個明確的「不行」與原因，而不是 500。
 *
 * 只有「權限表設定錯誤」才拋錯（`MisconfiguredPermissionError`）——
 * 因為那是**程式缺陷**，必須讓它爆。
 */
class Decision {
  #allowed;
  #reason;
  #details;

  constructor(allowed, reason, details) {
    this.#allowed = allowed;
    this.#reason = reason;
    this.#details = details;
    Object.freeze(this);
  }

  static allow() {
    return new Decision(true, 'ALLOWED', null);
  }

  /**
   * @param {string} reason 拒絕原因碼（見下方 Reason）
   * @param {object} [details] 除錯用的上下文（**不得含敏感資料**）
   */
  static deny(reason, details = null) {
    if (!reason) throw new TypeError('Decision.deny 需要原因碼');
    return new Decision(false, reason, details);
  }

  get allowed() {
    return this.#allowed;
  }

  get reason() {
    return this.#reason;
  }

  get details() {
    return this.#details;
  }

  /** 方便在 Use Case 中直接轉為 Result */
  toResult() {
    return this.#allowed ? null : { code: this.#reason, details: this.#details };
  }

  toString() {
    return this.#allowed ? 'ALLOW' : `DENY(${this.#reason})`;
  }
}

/**
 * 拒絕原因碼。
 *
 * ⚠️ **對外回應時，「角色不足」與「資源不屬於你」應使用同一個訊息**，
 *    否則會成為探測他人資料的管道（可以從錯誤訊息反推「這筆資料存在」）。
 *    reason 供**內部除錯與測試**使用，不直接回給前端。
 */
const Reason = Object.freeze({
  /** 權限表設定錯誤（應拋 MisconfiguredPermissionError，不應出現在這裡） */
  UNKNOWN_PERMISSION: 'UNKNOWN_PERMISSION',
  /** RBAC：這個角色／權限組沒有這個權限 */
  ROLE_NOT_PERMITTED: 'ROLE_NOT_PERMITTED',
  /** ABAC：資源不屬於該 actor */
  NOT_OWNER: 'NOT_OWNER',
  /** ABAC：不是被指派的師傅 */
  NOT_ASSIGNED_TECHNICIAN: 'NOT_ASSIGNED_TECHNICIAN',
  /** ABAC：不在客服負責區域 */
  OUT_OF_REGION: 'OUT_OF_REGION',
  /** ABAC：狀態前提不成立 */
  TARGET_NOT_ALLOWED_FOR_ROLE: 'TARGET_NOT_ALLOWED_FOR_ROLE',
  ILLEGAL_STATE_TRANSITION: 'ILLEGAL_STATE_TRANSITION',
  ROLE_CANNOT_TRANSITION: 'ROLE_CANNOT_TRANSITION',
  /** 金額：超過單筆門檻 */
  EXCEEDS_SINGLE_LIMIT: 'EXCEEDS_SINGLE_LIMIT',
  /** 金額：超過當日累計配額 */
  EXCEEDS_DAILY_QUOTA: 'EXCEEDS_DAILY_QUOTA',
  /** 金額：超過已付未退（**硬上限，所有角色皆適用**） */
  EXCEEDS_PAID_AMOUNT: 'EXCEEDS_PAID_AMOUNT',
  /** 金額：讀不到配額 → **保守拒絕** */
  DAILY_BUDGET_UNAVAILABLE: 'DAILY_BUDGET_UNAVAILABLE',
  INVALID_AMOUNT: 'INVALID_AMOUNT',
  AMOUNT_NOT_POSITIVE: 'AMOUNT_NOT_POSITIVE',
  /** 財務期間已關帳 */
  PERIOD_CLOSED: 'PERIOD_CLOSED',
  /** 職責分離：發起者不得批准 */
  SOD_VIOLATION: 'SOD_VIOLATION',
  /** 需要另一人覆核 */
  APPROVAL_REQUIRED: 'APPROVAL_REQUIRED',
  /** 缺少判斷所需的資料 */
  RESOURCE_MISSING: 'RESOURCE_MISSING',
});

module.exports = { Decision, Reason };
