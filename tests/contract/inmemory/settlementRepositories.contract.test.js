'use strict';

/** 金流與工單 Repository 契約測試 —— InMemory 實作。 */

const { defineRepositoryContracts } = require('../repositoryContract');
const {
  paymentCases,
  refundCases,
  sharingCases,
  workOrderCases,
  workOrderMessageCases,
} = require('../settlementRepositoryCases');

const { InMemoryPaymentRepository } = require('../../../packages/adapters/inmemory/InMemoryPaymentRepository');
const { InMemoryRefundRepository } = require('../../../packages/adapters/inmemory/InMemoryRefundRepository');
const { InMemoryProfitSharingRepository } = require('../../../packages/adapters/inmemory/InMemoryProfitSharingRepository');
const { InMemoryWorkOrderRepository } = require('../../../packages/adapters/inmemory/InMemoryWorkOrderRepository');
const { InMemoryWorkOrderMessageRepository } = require('../../../packages/adapters/inmemory/InMemoryWorkOrderMessageRepository');

defineRepositoryContracts({
  name: 'PaymentRepository（InMemory）',
  makeRepo: () => new InMemoryPaymentRepository(),
  cases: paymentCases,
});
defineRepositoryContracts({
  name: 'RefundRepository（InMemory）',
  makeRepo: () => new InMemoryRefundRepository(),
  cases: refundCases,
});
defineRepositoryContracts({
  name: 'ProfitSharingRepository（InMemory）',
  makeRepo: () => new InMemoryProfitSharingRepository(),
  cases: sharingCases,
});
defineRepositoryContracts({
  name: 'WorkOrderRepository（InMemory）',
  makeRepo: () => new InMemoryWorkOrderRepository(),
  cases: workOrderCases,
});
defineRepositoryContracts({
  name: 'WorkOrderMessageRepository（InMemory）',
  makeRepo: () => new InMemoryWorkOrderMessageRepository(),
  cases: workOrderMessageCases,
});
