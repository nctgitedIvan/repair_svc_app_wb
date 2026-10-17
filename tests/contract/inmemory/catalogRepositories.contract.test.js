'use strict';

/** 目錄模組契約測試 —— InMemory 實作。 */

const { defineRepositoryContracts } = require('../repositoryContract');
const { serviceCases, productCases } = require('../catalogRepositoryCases');
const { InMemoryServiceRepository } = require('../../../packages/adapters/inmemory/InMemoryServiceRepository');
const { InMemoryProductRepository } = require('../../../packages/adapters/inmemory/InMemoryProductRepository');

defineRepositoryContracts({
  name: 'ServiceRepository（InMemory）',
  makeRepo: () => new InMemoryServiceRepository(),
  cases: serviceCases,
});

defineRepositoryContracts({
  name: 'ProductRepository（InMemory）',
  makeRepo: () => new InMemoryProductRepository(),
  cases: productCases,
});
