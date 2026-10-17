'use strict';

const { projectOrder } = require('../shared/orderQueryProjector');

/**
 * InMemoryOrderQueryAdapter —— OrderQueryPort 的測試實作。
 *
 * 脫敏規則全部在 `orderQueryProjector`（呼叫 domain policies），本檔只做所有權檢查。
 */
class InMemoryOrderQueryAdapter {
  constructor({ orderRepository, customerRepository, clock, config = {} }) {
    if (!orderRepository) throw new TypeError('OrderQueryAdapter 需要 orderRepository');
    if (!clock) throw new TypeError('OrderQueryAdapter 需要 clock');
    this.orderRepository = orderRepository;
    this.customerRepository = customerRepository || null;
    this.clock = clock;
    this.config = config;
  }

  async findByIdForCustomer(actor, orderId) {
    const order = await this.orderRepository.findById(orderId);
    const customerId = actor.customerId || actor.id;
    if (!order || order.customerId !== customerId) return null;
    return this.#project(order, actor);
  }

  async findByIdForTechnician(actor, orderId) {
    const order = await this.orderRepository.findById(orderId);
    if (!order || !actor.technicianId || order.technicianId !== actor.technicianId) return null;

    // 多租戶隔離：師傅不得跨 merchantId 讀取
    const actorMerchant = actor.merchantId || 'platform';
    const orderMerchant = order.merchantId || 'platform';
    if (actorMerchant !== orderMerchant) return null;

    return this.#project(order, actor);
  }

  async findByIdForCsAgent(actor, orderId) {
    const order = await this.orderRepository.findById(orderId);
    if (!order) return null;
    return this.#project(order, actor);
  }

  async findByIdForAdmin(actor, orderId) {
    const order = await this.orderRepository.findById(orderId);
    if (!order) return null;
    return this.#project(order, actor);
  }

  async #project(order, actor) {
    const customer = this.customerRepository
      ? await this.customerRepository.findById(order.customerId)
      : null;
    return projectOrder({
      order,
      viewer: actor,
      customer,
      now: this.clock.now(),
      config: this.config,
    });
  }
}

module.exports = { InMemoryOrderQueryAdapter };
