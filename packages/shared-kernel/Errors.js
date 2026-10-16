'use strict';

/**
 * 錯誤型別階層。
 *
 * 為什麼需要它：`Result` 只有錯誤**碼**（字串），無法區分
 * 「呼叫端用錯了 API」與「業務前提不成立」——前者應該讓它爆，
 * 後者應該優雅回傳。有了型別階層，`catch` 才能精準處理。
 *
 * 使用原則（docs/01 §1.6.3）：
 *   - 業務失敗 → 回傳 `Result.fail()`，**不是**拋例外
 *   - 程式錯誤 / 不變式被破壞 → 拋 `DomainError` 子類，讓它大聲失敗
 *
 * 本檔屬 shared-kernel：零依賴、無 I/O、無時間、無隨機。
 */

/** 所有領域錯誤的基底 */
class DomainError extends Error {
  /**
   * @param {string} message 給開發者看的訊息（**不會**直接回給前端）
   * @param {{ code?: string, details?: object }} [options]
   */
  constructor(message, options = {}) {
    super(message);
    this.name = this.constructor.name;
    this.code = options.code || this.constructor.code || 'DOMAIN_ERROR';
    this.details = options.details || null;
    if (Error.captureStackTrace) Error.captureStackTrace(this, this.constructor);
  }

  /** 供日誌使用；刻意不含 details，避免誤把內部資料寫進日誌 */
  toLogObject() {
    return { name: this.name, code: this.code, message: this.message };
  }
}

/**
 * 不變式被破壞。
 *
 * 例：`Money.fromCents(1.5)`、`CommissionRate` 超出 0–10000。
 * 這代表**呼叫端寫錯了**，不是使用者做了什麼。應該讓它爆，不要吞掉。
 */
class InvariantViolation extends DomainError {
  static code = 'INVARIANT_VIOLATION';
}

/**
 * 非法的狀態轉移。
 *
 * 例：訂單從 `PENDING_PAYMENT` 直接跳到 `COMPLETED`。
 *
 * ⚠️ 注意：**這通常是程式錯誤，不是使用者錯誤。**
 * 「使用者不能做這個操作」應該在 `AccessPolicy` 就擋掉並回傳 `Result`；
 * 走到這裡代表狀態機與權限規則不一致 —— 應該讓它爆並修程式。
 */
class IllegalStateTransition extends DomainError {
  static code = 'ILLEGAL_STATE_TRANSITION';

  constructor(from, to, options = {}) {
    super(`非法狀態轉移：${keyOf(from)} → ${keyOf(to)}`, {
      ...options,
      code: IllegalStateTransition.code,
      details: { from: keyOf(from), to: keyOf(to) },
    });
    this.from = keyOf(from);
    this.to = keyOf(to);
  }
}

/** 找不到資源。Use Case 通常改回傳 `Result.notFound()`，此型別供 domain 內部使用。 */
class NotFoundError extends DomainError {
  static code = 'NOT_FOUND';

  constructor(resource, identifier, options = {}) {
    super(`${resource} 不存在：${identifier}`, {
      ...options,
      code: NotFoundError.code,
      details: { resource, identifier },
    });
  }
}

/**
 * 樂觀鎖衝突（`docs/01` §4.7.8）。
 *
 * 併發寫入同一文件時版本不符。**可重試**，呼叫端應據此重試而非直接失敗。
 */
class ConcurrencyConflict extends DomainError {
  static code = 'CONCURRENCY_CONFLICT';

  constructor(resource, expectedVersion, actualVersion, options = {}) {
    super(`${resource} 版本衝突：預期 ${expectedVersion}，實際 ${actualVersion}`, {
      ...options,
      code: ConcurrencyConflict.code,
      details: { resource, expectedVersion, actualVersion },
    });
    this.retryable = true;
  }
}

/**
 * 職責分離（SoD）違反。
 *
 * 例：同一人既發起退款又批准（`docs/P2-計畫.md` §C-2）。
 *
 * ⚠️ 注意：**SoD 只在 `refunds.approve_large` 上強制。**
 * `approve_small`（≤ 200 元）的單人審批是**設計**，不是違規 ——
 * 若在這裡也拋錯，客服中心只有一人時退款會完全卡住。
 */
class SoDViolationError extends DomainError {
  static code = 'SOD_VIOLATION';

  constructor({ action, actorId, conflictingActorId }, options = {}) {
    super(`職責分離違反：${action} 的發起者與批准者不得為同一人`, {
      ...options,
      code: SoDViolationError.code,
      details: { action, actorId, conflictingActorId },
    });
  }
}

/**
 * 財務期間已關帳。
 *
 * 例：對已關帳期間的訂單修改金額（`docs/P2-計畫.md` §B-4）。
 * 沖銷（reversal）不受此限 —— 它是唯一允許的例外。
 */
class PeriodClosedError extends DomainError {
  static code = 'PERIOD_CLOSED';

  constructor({ periodClosedThrough, attemptedAt, resource }, options = {}) {
    super(`財務期間已關帳（至 ${periodClosedThrough}），不得修改其金額`, {
      ...options,
      code: PeriodClosedError.code,
      details: { periodClosedThrough, attemptedAt, resource },
    });
  }
}

/**
 * 對帳差異超過閾值。
 *
 * 例：單筆差異 > 1 元 / 單日累計 > 100 元 / > 1000 元（後者會凍結當日結算）。
 */
class ReconciliationMismatchError extends DomainError {
  static code = 'RECONCILIATION_MISMATCH';

  constructor({ scope, expectedCents, actualCents, thresholdCents, tier }, options = {}) {
    super(
      `對帳差異超過閾值：預期 ${expectedCents} 分，實際 ${actualCents} 分` +
        `（差 ${Math.abs(expectedCents - actualCents)} 分，閾值 ${thresholdCents} 分，第 ${tier} 層）`,
      {
        ...options,
        code: ReconciliationMismatchError.code,
        details: { scope, expectedCents, actualCents, thresholdCents, tier },
      },
    );
  }
}

/**
 * 需要覆核才能執行。
 *
 * 例：改價超 20%、改分潤比例，需第二人覆核（`docs/P2-計畫.md` §C-3）。
 * 單一管理員時期走「單人例外 + 24h 冷卻期」路徑，不拋此錯。
 */
class ApprovalRequiredError extends DomainError {
  static code = 'APPROVAL_REQUIRED';

  constructor({ action, reason, requiredApprovers }, options = {}) {
    super(`操作需要覆核：${action}（${reason}）`, {
      ...options,
      code: ApprovalRequiredError.code,
      details: { action, reason, requiredApprovers },
    });
  }
}

/** 判斷是否為可重試的錯誤（供 Saga / 定時任務的補償邏輯使用） */
function isRetryable(error) {
  return Boolean(error && (error.retryable === true || error.code === ConcurrencyConflict.code));
}

function keyOf(status) {
  if (status === null || status === undefined) return String(status);
  if (typeof status === 'string') return status;
  if (typeof status === 'object' && 'key' in status) return status.key;
  if (typeof status === 'object' && 'value' in status) return String(status.value);
  return String(status);
}

module.exports = {
  DomainError,
  InvariantViolation,
  IllegalStateTransition,
  NotFoundError,
  ConcurrencyConflict,
  SoDViolationError,
  PeriodClosedError,
  ReconciliationMismatchError,
  ApprovalRequiredError,
  isRetryable,
};
