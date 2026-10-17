'use strict';

/** InMemoryProfitSharingRepository —— ProfitSharingRepository 的測試替身。 */
class InMemoryProfitSharingRepository {
  #sharings = new Map();
  #byOutOrderNo = new Map();
  #returns = new Map();

  async findByOutOrderNo(outOrderNo) {
    assertString(outOrderNo, 'outOrderNo');
    const sharingId = this.#byOutOrderNo.get(outOrderNo);
    return sharingId ? clone(this.#sharings.get(sharingId)) : null;
  }

  async listByOrderId(orderId) {
    assertString(orderId, 'orderId');
    return [...this.#sharings.values()]
      .filter((sharing) => sharing.orderId === orderId)
      .map(clone)
      .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  }

  async save(sharing) {
    if (!sharing || typeof sharing !== 'object') {
      throw new TypeError('ProfitSharing.save(sharing) 需要物件');
    }
    assertString(sharing.sharingId, 'sharingId');
    assertString(sharing.orderId, 'orderId');
    assertString(sharing.outOrderNo, 'outOrderNo');

    const existingId = this.#byOutOrderNo.get(sharing.outOrderNo);
    if (existingId && existingId !== sharing.sharingId) {
      throw new Error(`outOrderNo 重複：${sharing.outOrderNo}`);
    }

    this.#sharings.set(sharing.sharingId, clone(sharing));
    this.#byOutOrderNo.set(sharing.outOrderNo, sharing.sharingId);
  }

  async saveReturn(record) {
    if (!record || typeof record !== 'object') {
      throw new TypeError('ProfitSharing.saveReturn(record) 需要物件');
    }
    assertString(record.returnId, 'returnId');
    assertString(record.orderId, 'orderId');
    this.#returns.set(record.returnId, clone(record));
  }

  async listReturnsByOrderId(orderId) {
    assertString(orderId, 'orderId');
    return [...this.#returns.values()]
      .filter((record) => record.orderId === orderId)
      .map(clone)
      .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  }

  size() {
    return this.#sharings.size + this.#returns.size;
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

module.exports = { InMemoryProfitSharingRepository };
