'use strict';

/** InMemoryPaymentRepository —— PaymentRepository 的測試替身。 */
class InMemoryPaymentRepository {
  #payments = new Map();
  #byOutTradeNo = new Map();

  async findByOutTradeNo(outTradeNo) {
    assertString(outTradeNo, 'outTradeNo');
    const paymentId = this.#byOutTradeNo.get(outTradeNo);
    return paymentId ? clone(this.#payments.get(paymentId)) : null;
  }

  async listByOrderId(orderId) {
    assertString(orderId, 'orderId');
    return [...this.#payments.values()]
      .filter((payment) => payment.orderId === orderId)
      .map(clone)
      .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  }

  async save(payment) {
    if (!payment || typeof payment !== 'object') {
      throw new TypeError('Payment.save(payment) 需要物件');
    }
    assertString(payment.paymentId, 'paymentId');
    assertString(payment.orderId, 'orderId');
    assertString(payment.outTradeNo, 'outTradeNo');

    const existingId = this.#byOutTradeNo.get(payment.outTradeNo);
    if (existingId && existingId !== payment.paymentId) {
      throw new Error(`outTradeNo 重複：${payment.outTradeNo}`);
    }

    this.#payments.set(payment.paymentId, clone(payment));
    this.#byOutTradeNo.set(payment.outTradeNo, payment.paymentId);
  }

  size() {
    return this.#payments.size;
  }
}

function assertString(value, name) {
  if (typeof value !== 'string' || value.length === 0) {
    throw new TypeError(`${name} 必須是非空字串`);
  }
}
function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

module.exports = { InMemoryPaymentRepository };
