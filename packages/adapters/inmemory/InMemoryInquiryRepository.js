'use strict';

/** InMemoryInquiryRepository —— InquiryRepository 的測試替身。 */
class InMemoryInquiryRepository {
  #inquiries = new Map();

  async create(inquiry) {
    if (!inquiry || typeof inquiry !== 'object') {
      throw new TypeError('Inquiry.create(inquiry) 需要物件');
    }
    assertString(inquiry.inquiryId, 'inquiryId');
    assertString(inquiry.customerId, 'customerId');
    assertString(inquiry.productId, 'productId');
    if (this.#inquiries.has(inquiry.inquiryId)) {
      throw new Error(`詢問已存在：${inquiry.inquiryId}`);
    }

    this.#inquiries.set(inquiry.inquiryId, {
      inquiryId: inquiry.inquiryId,
      customerId: inquiry.customerId,
      productId: inquiry.productId,
      productSnapshot: inquiry.productSnapshot
        ? clone(inquiry.productSnapshot)
        : { name: '', image: '', priceCents: 0 },
      message: inquiry.message || '',
      status: inquiry.status || 'pending',
      createdAt: Number.isInteger(inquiry.createdAt) ? inquiry.createdAt : null,
      csAgentId: inquiry.csAgentId || null,
      replies: Array.isArray(inquiry.replies) ? clone(inquiry.replies) : [],
    });
  }

  async findById(inquiryId) {
    assertString(inquiryId, 'inquiryId');
    const inquiry = this.#inquiries.get(inquiryId);
    return inquiry ? clone(inquiry) : null;
  }

  async listByCustomer(customerId) {
    assertString(customerId, 'customerId');
    return [...this.#inquiries.values()]
      .filter((inquiry) => inquiry.customerId === customerId)
      .map(clone)
      .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  }

  async listPending() {
    return [...this.#inquiries.values()]
      .filter((inquiry) => inquiry.status === 'pending')
      .map(clone)
      .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
  }

  async appendReply(inquiryId, reply) {
    assertString(inquiryId, 'inquiryId');
    if (!reply || typeof reply !== 'object') {
      throw new TypeError('appendReply 需要 reply 物件');
    }
    const inquiry = this.#inquiries.get(inquiryId);
    if (!inquiry) throw new Error(`詢問不存在：${inquiryId}`);

    inquiry.replies.push(clone(reply));
    inquiry.status = 'replied';
    return clone(inquiry);
  }

  async close(inquiryId, { csAgentId } = {}) {
    assertString(inquiryId, 'inquiryId');
    const inquiry = this.#inquiries.get(inquiryId);
    if (!inquiry) throw new Error(`詢問不存在：${inquiryId}`);

    inquiry.status = 'closed';
    if (csAgentId) inquiry.csAgentId = csAgentId;
    return clone(inquiry);
  }

  size() {
    return this.#inquiries.size;
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

module.exports = { InMemoryInquiryRepository };
