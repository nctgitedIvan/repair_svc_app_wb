'use strict';

const { projectOrder } = require('../shared/orderQueryProjector');

/**
 * CloudDBOrderQueryAdapter —— OrderQueryPort 的雲端實作（只寫不跑）。
 *
 * 依賴已注入的 CloudDBOrderRepository／CloudDBCustomerRepository；
 * 本檔只做所有權檢查與投影。
 */
function createCloudDBOrderQueryAdapter({ orderRepository, customerRepository, clock, config = {} } = {}) {
  if (!orderRepository) throw new TypeError('CloudDBOrderQueryAdapter 需要 orderRepository');
  if (!clock) throw new TypeError('CloudDBOrderQueryAdapter 需要 clock');

  async function project(order, actor) {
    const customer = customerRepository
      ? await customerRepository.findById(order.customerId)
      : null;
    return projectOrder({ order, viewer: actor, customer, now: clock.now(), config });
  }

  return {
    async findByIdForCustomer(actor, orderId) {
      const order = await orderRepository.findById(orderId);
      const customerId = actor.customerId || actor.id;
      if (!order || order.customerId !== customerId) return null;
      return project(order, actor);
    },

    async findByIdForTechnician(actor, orderId) {
      const order = await orderRepository.findById(orderId);
      if (!order || !actor.technicianId || order.technicianId !== actor.technicianId) return null;
      return project(order, actor);
    },

    async findByIdForCsAgent(actor, orderId) {
      const order = await orderRepository.findById(orderId);
      return order ? project(order, actor) : null;
    },

    async findByIdForAdmin(actor, orderId) {
      const order = await orderRepository.findById(orderId);
      return order ? project(order, actor) : null;
    },
  };
}

module.exports = { createCloudDBOrderQueryAdapter };
