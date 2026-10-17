'use strict';

/** InMemoryWorkOrderRepository —— WorkOrderRepository 的測試替身。 */
class InMemoryWorkOrderRepository {
  #tickets = new Map();
  #orderIndex = new Map();

  async findByOrderId(orderId) {
    assertString(orderId, 'orderId');
    const ticketId = this.#orderIndex.get(orderId);
    return ticketId ? clone(this.#tickets.get(ticketId)) : null;
  }

  async listByStatus(status) {
    assertString(status, 'status');
    return [...this.#tickets.values()]
      .filter((ticket) => ticket.status === status)
      .map(clone)
      .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
  }

  async save(ticket) {
    if (!ticket || typeof ticket !== 'object') {
      throw new TypeError('WorkOrder.save(ticket) 需要物件');
    }
    assertString(ticket.ticketId, 'ticketId');
    assertString(ticket.orderId, 'orderId');

    const existingTicketId = this.#orderIndex.get(ticket.orderId);
    if (existingTicketId && existingTicketId !== ticket.ticketId) {
      throw new Error(`orderId 重複工單：${ticket.orderId}`);
    }

    this.#tickets.set(ticket.ticketId, clone(ticket));
    this.#orderIndex.set(ticket.orderId, ticket.ticketId);
  }

  size() {
    return this.#tickets.size;
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

module.exports = { InMemoryWorkOrderRepository };
