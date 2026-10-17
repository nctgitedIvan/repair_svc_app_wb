'use strict';

/** 身分模組契約測試 —— InMemory 實作。 */

const { defineRepositoryContracts } = require('../repositoryContract');
const {
  userCases,
  customerCases,
  csAgentCases,
  technicianCases,
} = require('../identityRepositoryCases');

const { InMemoryUserRepository } = require('../../../packages/adapters/inmemory/InMemoryUserRepository');
const { InMemoryCustomerRepository } = require('../../../packages/adapters/inmemory/InMemoryCustomerRepository');
const { InMemoryCsAgentRepository } = require('../../../packages/adapters/inmemory/InMemoryCsAgentRepository');
const { InMemoryTechnicianRepository } = require('../../../packages/adapters/inmemory/InMemoryTechnicianRepository');

defineRepositoryContracts({
  name: 'UserRepository（InMemory）',
  makeRepo: () => new InMemoryUserRepository(),
  cases: userCases,
});

defineRepositoryContracts({
  name: 'CustomerRepository（InMemory）',
  makeRepo: () => new InMemoryCustomerRepository(),
  cases: customerCases,
});

defineRepositoryContracts({
  name: 'CsAgentRepository（InMemory）',
  makeRepo: () => new InMemoryCsAgentRepository(),
  cases: csAgentCases,
});

defineRepositoryContracts({
  name: 'TechnicianRepository（InMemory）',
  makeRepo: () => new InMemoryTechnicianRepository(),
  cases: technicianCases,
});
