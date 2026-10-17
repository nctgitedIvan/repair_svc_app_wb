'use strict';

/**
 * MockPaymentGateway —— P5 的模擬支付。
 *
 * 可模擬：
 *  - 支付成功／失敗（`failNext('createPayment')`）
 *  - 退款成功／失敗
 *  - 分帳成功／失敗
 *
 * 記錄每次呼叫，供整合測試斷言。
 */
class MockPaymentGateway {
  #calls = [];
  #failNext = new Set();

  /** @param {{ failAll?: boolean }} [options] */
  constructor({ failAll = false } = {}) {
    this.failAll = failAll;
  }

  failNext(operation) {
    this.#failNext.add(operation);
    return this;
  }

  calls() {
    return this.#calls.map((call) => ({ ...call }));
  }

  reset() {
    this.#calls = [];
    this.#failNext.clear();
  }

  #shouldFail(operation) {
    if (this.failAll || this.#failNext.has(operation)) {
      this.#failNext.delete(operation);
      return true;
    }
    return false;
  }

  async createPayment({ orderId, orderNo, amountCents, currency, outTradeNo } = {}) {
    this.#calls.push({ operation: 'createPayment', orderId, orderNo, amountCents, currency, outTradeNo });
    if (this.#shouldFail('createPayment')) {
      return { ok: false, code: 'MOCK_PAYMENT_FAILED', message: '模擬支付失敗' };
    }
    return { ok: true, prepayId: `mock-prepay-${outTradeNo}`, channel: 'mock' };
  }

  async refund({ orderId, orderNo, outRefundNo, amountCents, reason } = {}) {
    this.#calls.push({ operation: 'refund', orderId, orderNo, outRefundNo, amountCents, reason });
    if (this.#shouldFail('refund')) {
      return { ok: false, code: 'MOCK_REFUND_FAILED', message: '模擬退款失敗' };
    }
    return { ok: true, refundId: `mock-refund-${outRefundNo}`, status: 'success' };
  }

  async executeProfitSharing({ orderId, orderNo, outOrderNo, receiverId, amountCents } = {}) {
    this.#calls.push({ operation: 'executeProfitSharing', orderId, orderNo, outOrderNo, receiverId, amountCents });
    if (this.#shouldFail('executeProfitSharing')) {
      return { ok: false, code: 'MOCK_PROFIT_SHARING_FAILED', message: '模擬分帳失敗' };
    }
    return { ok: true, status: 'success' };
  }
}

module.exports = { MockPaymentGateway };
