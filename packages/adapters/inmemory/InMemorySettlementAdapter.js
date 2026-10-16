'use strict';

const { SettlementMode, SettlementStatus } = require('@repair/ports/SettlementGateway');

/**
 * InMemorySettlementAdapter —— SettlementGateway 的測試替身。
 *
 * 這個檔案的存在，就是「P1–P5 零外部依賴」得以成立的原因：
 * 沒有商戶號、沒有分帳權限，P5 依然能完整測試
 * ExecuteProfitSharing / ExecuteProfitSharingReturn / ExecuteRefund 的邏輯。
 *
 * 可模擬四種結果：SUCCESS / FAILED / PENDING / TIMEOUT。
 * PENDING 可透過 `completePending()` 手動收斂，用來測試「非同步處理中」
 * 與 RecoverStuckSettlements 的補償邏輯。
 *
 * 鐵律（docs/01 §1.6.5）：**零業務邏輯**。
 * 這裡沒有任何金額計算、狀態判斷、分潤比例，也沒有角色判斷。
 * 判準：把它換成真實 adapter，業務行為必須完全不變。
 */
class InMemorySettlementAdapter {
  #mode;
  #outcomes;
  #capabilitiesOverride;
  #calls = [];
  #pending = new Map();
  #seq = 0;

  /**
   * @param {object} [options]
   * @param {string} [options.settlementMode] SettlementMode 之一
   * @param {object} [options.outcomes] 各方法的預設結果，例如 { settle: 'FAILED' }
   *        可用值：'SUCCESS' | 'FAILED' | 'PENDING' | 'TIMEOUT'
   * @param {object} [options.capabilities] 覆寫能力宣告（測試備案模式用）
   */
  constructor(options = {}) {
    this.#mode = options.settlementMode || SettlementMode.PROFIT_SHARING;
    this.#capabilitiesOverride = options.capabilities || null;
    this.#outcomes = {
      settle: 'SUCCESS',
      beforeRefund: 'SUCCESS',
      refund: 'SUCCESS',
      ...options.outcomes,
    };
  }

  /**
   * 能力宣告。
   * 切換成 SettlementMode.PLATFORM_ESCROW 即可模擬備案模式，
   * 用來驗證 Use Case 在兩種模式下都能正確運作。
   */
  capabilities() {
    if (this.#capabilitiesOverride) return { ...this.#capabilitiesOverride };
    const isProfitSharing = this.#mode === SettlementMode.PROFIT_SHARING;
    return {
      settlementMode: this.#mode,
      supportsFreeze: isProfitSharing,
      supportsSharingReturn: isProfitSharing,
      supportsPartialRefund: true,
      requiresReceiverOnboarding: isProfitSharing,
    };
  }

  async onPaymentSuccess(order, payment) {
    this.#record('onPaymentSuccess', { orderId: order && order.id, payment });
  }

  async settle(order) {
    this.#record('settle', { orderId: order && order.id });
    return this.#resolve('settle');
  }

  async beforeRefund(order, refundAmountCents) {
    this.#record('beforeRefund', { orderId: order && order.id, refundAmountCents });
    const outcome = this.#resolve('beforeRefund');
    if (outcome.status === SettlementStatus.SUCCESS) {
      outcome.returnedCents = refundAmountCents;
    }
    return outcome;
  }

  async refund(order, refundRequest) {
    this.#record('refund', { orderId: order && order.id, refundRequest });
    return this.#resolve('refund');
  }

  async querySettlement(reference) {
    this.#record('querySettlement', { reference });
    const entry = this.#pending.get(reference);
    if (!entry) {
      return { status: SettlementStatus.FAILED, reference, raw: { reason: 'UNKNOWN_REFERENCE' } };
    }
    return { status: entry.status, reference };
  }

  // ── 測試輔助（不屬契約，僅供測試使用）──

  /** 依呼叫順序回傳記錄。用來斷言「退款前必須先做分帳回退」 */
  calls() {
    return this.#calls.map((c) => ({ ...c }));
  }

  methodNames() {
    return this.#calls.map((c) => c.method);
  }

  /** 動態改寫某方法的結果（模擬中途失敗） */
  setOutcome(method, outcome) {
    this.#outcomes[method] = outcome;
    return this;
  }

  /** 把某個 PENDING 的 reference 收斂成最終狀態 */
  completePending(reference, status = SettlementStatus.SUCCESS) {
    const entry = this.#pending.get(reference);
    if (!entry) return false;
    entry.status = status;
    return true;
  }

  reset() {
    this.#calls = [];
    this.#pending.clear();
    this.#seq = 0;
    return this;
  }

  // ── 內部 ──

  #resolve(method) {
    const outcome = this.#outcomes[method] || 'SUCCESS';

    if (outcome === 'TIMEOUT') {
      // 模擬「呼叫未回應」——真實世界的網路逾時。
      // 刻意讓它拋出：逾時不是業務失敗，是基礎設施問題，
      // 呼叫端必須走補償流程而非當成 FAILED 直接放棄。
      const err = new Error(`settlement timeout: ${method}`);
      err.code = 'TIMEOUT';
      err.retryable = true;
      throw err;
    }

    this.#seq += 1;
    const reference = `${method}-ref-${this.#seq}`;

    if (outcome === 'PENDING') {
      this.#pending.set(reference, { status: SettlementStatus.PENDING });
      return { status: SettlementStatus.PENDING, reference };
    }
    if (outcome === 'FAILED') {
      return { status: SettlementStatus.FAILED, reference: null, raw: { reason: 'SIMULATED_FAILURE' } };
    }
    return { status: SettlementStatus.SUCCESS, reference };
  }

  #record(method, payload) {
    this.#calls.push({ method, ...payload, seq: this.#calls.length });
  }
}

module.exports = { InMemorySettlementAdapter };
