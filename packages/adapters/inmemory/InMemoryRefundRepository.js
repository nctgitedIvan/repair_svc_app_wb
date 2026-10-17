'use strict';

/** InMemoryRefundRepository —— RefundRepository 的測試替身。 */
class InMemoryRefundRepository {
  #refunds = new Map();
  #byOutRefundNo = new Map();

  async findById(refundId) {
    assertString(refundId, 'refundId');
    const refund = this.#refunds.get(refundId);
    return refund ? clone(refund) : null;
  }

  async findByOutRefundNo(outRefundNo) {
    assertString(outRefundNo, 'outRefundNo');
    const refundId = this.#byOutRefundNo.get(outRefundNo);
    return refundId ? clone(this.#refunds.get(refundId)) : null;
  }

  async listByOrderId(orderId) {
    assertString(orderId, 'orderId');
    return [...this.#refunds.values()]
      .filter((refund) => refund.orderId === orderId)
      .map(clone)
      .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  }

  async save(refund) {
    if (!refund || typeof refund !== 'object') {
      throw new TypeError('Refund.save(refund) 需要物件');
    }
    assertString(refund.refundId, 'refundId');
    assertString(refund.orderId, 'orderId');
    assertString(refund.outRefundNo, 'outRefundNo');

    const existingId = this.#byOutRefundNo.get(refund.outRefundNo);
    if (existingId && existingId !== refund.refundId) {
      throw new Error(`outRefundNo 重複：${refund.outRefundNo}`);
    }

    this.#refunds.set(refund.refundId, clone(refund));
    this.#byOutRefundNo.set(refund.outRefundNo, refund.refundId);
  }

  size() {
    return this.#refunds.size;
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

module.exports = { InMemoryRefundRepository };
