'use strict';

/** P7b 前置 Repository 契約測試 —— CloudDB 實作（目前跳過）。 */

const test = require('node:test');
const { runCases } = require('../repositoryContract');
const { cartCases, favoriteCases, inquiryCases } = require('../p7bRepositoryCases');

const enabled = process.env.RUN_CLOUD_CONTRACT === '1';

test(
  'CloudDB P7b 前置 Repository 契約（需真實雲環境）',
  { skip: !enabled ? '沒有雲環境；設定 RUN_CLOUD_CONTRACT=1 才會執行' : false },
  async (t) => {
    const cloud = require('wx-server-sdk');
    cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

    const { createCloudDBClient } = require('../../../packages/adapters/clouddb/CloudDBClient');
    const { createCloudDBUnitOfWork } = require('../../../packages/adapters/clouddb/CloudDBUnitOfWork');
    const { createCloudDBCartRepository } = require('../../../packages/adapters/clouddb/CloudDBCartRepository');
    const { createCloudDBFavoriteRepository } = require('../../../packages/adapters/clouddb/CloudDBFavoriteRepository');
    const { createCloudDBInquiryRepository } = require('../../../packages/adapters/clouddb/CloudDBInquiryRepository');

    const client = createCloudDBClient(cloud);
    const uow = createCloudDBUnitOfWork(client);

    await t.test('Cart', async (t2) => {
      await runCases(t2, () => createCloudDBCartRepository({ client }), cartCases);
    });

    await t.test('Favorite', async (t2) => {
      await runCases(t2, () => createCloudDBFavoriteRepository({ client }), favoriteCases);
    });

    await t.test('Inquiry', async (t2) => {
      await runCases(t2, () => createCloudDBInquiryRepository({ client, uow }), inquiryCases);
    });
  },
);
