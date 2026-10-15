'use strict';

/**
 * Result —— Use Case 與 domain 的統一回傳型別。
 *
 * 規則（對應 docs/01-目標架構.md §1.6.3）：
 *  - Use Case 一律回傳 Result，且 value 必須是 DTO／值物件，**不得是實體**。
 *  - 失敗不是例外，是 Result。例外只保留給「真正的程式錯誤」。
 */

/** 錯誤碼 → HTTP-ish 語意，供 entrypoint 的 toResponse 轉譯 */
const ErrorCode = Object.freeze({
  VALIDATION: 'VALIDATION',
  UNAUTHENTICATED: 'UNAUTHENTICATED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  /** 前置條件不滿足（狀態機拒絕） */
  PRECONDITION_FAILED: 'PRECONDITION_FAILED',
  /** 外部系統失敗（支付、分帳），可重試 */
  UPSTREAM_FAILED: 'UPSTREAM_FAILED',
  INTERNAL: 'INTERNAL',
});

class Result {
  #ok;
  #value;
  #error;

  constructor(ok, value, error) {
    this.#ok = ok;
    this.#value = value;
    this.#error = error;
    Object.freeze(this);
  }

  static ok(value) {
    return new Result(true, value, null);
  }

  static fail(code, message, details = null) {
    return new Result(false, null, { code, message, details });
  }

  static validation(message, details) {
    return Result.fail(ErrorCode.VALIDATION, message, details);
  }

  static unauthenticated(message = '請先登入') {
    return Result.fail(ErrorCode.UNAUTHENTICATED, message);
  }

  static forbidden(message = '無權限執行此操作') {
    return Result.fail(ErrorCode.FORBIDDEN, message);
  }

  static notFound(message = '資源不存在') {
    return Result.fail(ErrorCode.NOT_FOUND, message);
  }

  static conflict(message) {
    return Result.fail(ErrorCode.CONFLICT, message);
  }

  static preconditionFailed(message, details) {
    return Result.fail(ErrorCode.PRECONDITION_FAILED, message, details);
  }

  static upstreamFailed(message, details) {
    return Result.fail(ErrorCode.UPSTREAM_FAILED, message, details);
  }

  get ok() {
    return this.#ok;
  }

  get isFailure() {
    return !this.#ok;
  }

  /** 僅在 ok === true 時有值 */
  get value() {
    return this.#value;
  }

  /** 僅在 ok === false 時有值：{ code, message, details } */
  get error() {
    return this.#error;
  }

  get code() {
    return this.#ok ? null : this.#error.code;
  }

  /** 串接：成功時套用 fn，失敗時原樣傳遞 */
  map(fn) {
    return this.#ok ? Result.ok(fn(this.#value)) : this;
  }

  toString() {
    return this.#ok ? `Result.ok(${JSON.stringify(this.#value)})` : `Result.fail(${this.#error.code})`;
  }
}

module.exports = { Result, ErrorCode };
