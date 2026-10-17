'use strict';

/** P7b 前置 Repository 契約測試 —— InMemory 實作。 */

const { defineRepositoryContracts } = require('../repositoryContract');
const { cartCases, favoriteCases, inquiryCases } = require('../p7bRepositoryCases');
const { InMemoryCartRepository } = require('../../../packages/adapters/inmemory/InMemoryCartRepository');
const { InMemoryFavoriteRepository } = require('../../../packages/adapters/inmemory/InMemoryFavoriteRepository');
const { InMemoryInquiryRepository } = require('../../../packages/adapters/inmemory/InMemoryInquiryRepository');

defineRepositoryContracts({
  name: 'CartRepository（InMemory）',
  makeRepo: () => new InMemoryCartRepository(),
  cases: cartCases,
});

defineRepositoryContracts({
  name: 'FavoriteRepository（InMemory）',
  makeRepo: () => new InMemoryFavoriteRepository(),
  cases: favoriteCases,
});

defineRepositoryContracts({
  name: 'InquiryRepository（InMemory）',
  makeRepo: () => new InMemoryInquiryRepository(),
  cases: inquiryCases,
});
