'use strict';

const { IllegalStateTransition } = require('@repair/shared-kernel/Errors');
const { OrderStatus, TRANSITIONS, fromValue, canTransition, isTerminal } = require('./OrderStatus');

/**
 * OrderStateMachine —— 訂單狀態機。
 *
 * **職責邊界（刻意畫清）**：
 *   本物件只回答「**這個轉移在結構上可不可能**」。
 *   「**誰**能在這個狀態做這個轉移」是 `packages/domain/access/AccessPolicy` 的職責（P4c）。
 *
 * 為什麼要分開：狀態規則與權限規則的變更頻率與理由完全不同。
 * 混在一起會讓「加一個狀態」變成「要同時改權限矩陣」，兩者互相牽制。
 *
 * 唯一真實來源是 `OrderStatus.TRANSITIONS` —— 本物件不另外維護一份表。
 */
class OrderStateMachine {
  #status;

  constructor(status) {
    this.#status = typeof status === 'string' ? OrderStatus[status] : status;
    if (!this.#status) throw new TypeError(`未知的訂單狀態：${status}`);
  }

  static for(status) {
    return new OrderStateMachine(status);
  }

  get status() {
    return this.#status;
  }

  get statusKey() {
    return this.#status.key;
  }

  isTerminal() {
    return isTerminal(this.#status);
  }

  /** 目前狀態所有結構上可達的目標（狀態 key 陣列） */
  allowedTargets() {
    return [...(TRANSITIONS[this.#status.key] || [])];
  }

  /** @param {object|string} target 狀態物件或 key */
  canTransitionTo(target) {
    return canTransition(this.#status, normalize(target));
  }

  /**
   * 斷言可轉移，否則拋 `IllegalStateTransition`。
   *
   * ⚠️ 拋錯代表**程式錯誤**（呼叫端搞錯了流程），不是業務失敗。
   *    「使用者不能做這個操作」應該在 `AccessPolicy` 就被擋下並回傳 `Result`。
   */
  assertCanTransitionTo(target) {
    const to = normalize(target);
    if (!this.canTransitionTo(to)) {
      throw new IllegalStateTransition(this.#status, to, {
        details: { allowed: this.allowedTargets() },
      });
    }
    return to;
  }

  /** 一批操作人可用的目標（供 UI 決定要顯示哪些按鈕；**不是**安全邊界） */
  describe() {
    return {
      status: this.#status.key,
      value: this.#status.value,
      label: this.#status.label,
      terminal: isTerminal(this.#status),
      allowedTargets: this.allowedTargets(),
    };
  }
}

function normalize(target) {
  if (target === null || target === undefined) {
    throw new TypeError('OrderStateMachine：目標狀態不得為空');
  }
  if (typeof target === 'string') return OrderStatus[target];
  if (typeof target === 'object' && 'key' in target) return target;
  if (typeof target === 'number') return fromValue(target);
  throw new TypeError(`無法解析的目標狀態：${JSON.stringify(target)}`);
}

module.exports = { OrderStateMachine };
