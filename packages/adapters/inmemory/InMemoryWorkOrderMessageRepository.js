'use strict';

/** InMemoryWorkOrderMessageRepository —— WorkOrderMessageRepository 的測試替身。 */
class InMemoryWorkOrderMessageRepository {
  #messages = new Map();

  async listByTicketId(ticketId) {
    assertString(ticketId, 'ticketId');
    return [...this.#messages.values()]
      .filter((message) => message.ticketId === ticketId)
      .map(clone)
      .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
  }

  async append(message) {
    if (!message || typeof message !== 'object') {
      throw new TypeError('WorkOrderMessage.append(message) 需要物件');
    }
    assertString(message.messageId, 'messageId');
    assertString(message.ticketId, 'ticketId');
    if (this.#messages.has(message.messageId)) {
      throw new Error(`messageId 重複：${message.messageId}`);
    }
    this.#messages.set(message.messageId, clone(message));
  }

  size() {
    return this.#messages.size;
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

module.exports = { InMemoryWorkOrderMessageRepository };
