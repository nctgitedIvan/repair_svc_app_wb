'use strict';

/** 訂單聚合與明細契約測試 —— InMemory 實作。 */

const { defineRepositoryContracts } = require('../repositoryContract');
const { orderCases, orderItemCases } = require('../orderRepositoryCases');
const { InMemoryOrderRepository } = require('../../../packages/adapters/inmemory/InMemoryOrderRepository');
const { InMemoryOrderItemRepository } = require('../../../packages/adapters/inmemory/InMemoryOrderItemRepository');

defineRepositoryContracts({
  name: 'OrderRepository（InMemory）',
  makeRepo: () => new InMemoryOrderRepository(),
  cases: orderCases,
});

defineRepositoryContracts({
  name: 'OrderItemRepository（InMemory）',
  makeRepo: () => new InMemoryOrderItemRepository(),
  cases: orderItemCases,
});
