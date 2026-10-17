'use strict';

/**
 * 基礎 Repository 契約測試 —— InMemory 實作。
 *
 * 這是目前**實際會跑**的契約測試；CloudDB 版見 `tests/contract/clouddb/`。
 */

const { defineRepositoryContracts } = require('../repositoryContract');
const {
  idSequenceCases,
  auditLogCases,
  systemConfigCases,
  categoryCases,
} = require('../baseRepositoryCases');

const { InMemoryIdSequenceRepository } = require('../../../packages/adapters/inmemory/InMemoryIdSequenceRepository');
const { InMemoryAuditLogRepository } = require('../../../packages/adapters/inmemory/InMemoryAuditLogRepository');
const { InMemorySystemConfigRepository } = require('../../../packages/adapters/inmemory/InMemorySystemConfigRepository');
const { InMemoryCategoryRepository } = require('../../../packages/adapters/inmemory/InMemoryCategoryRepository');

defineRepositoryContracts({
  name: 'IdSequenceRepository（InMemory）',
  makeRepo: () => new InMemoryIdSequenceRepository(),
  cases: idSequenceCases,
});

defineRepositoryContracts({
  name: 'AuditLogRepository（InMemory）',
  makeRepo: () => new InMemoryAuditLogRepository(),
  cases: auditLogCases,
});

defineRepositoryContracts({
  name: 'SystemConfigRepository（InMemory）',
  makeRepo: () => new InMemorySystemConfigRepository(),
  cases: systemConfigCases,
});

defineRepositoryContracts({
  name: 'CategoryRepository（InMemory）',
  makeRepo: () => new InMemoryCategoryRepository(),
  cases: categoryCases,
});
