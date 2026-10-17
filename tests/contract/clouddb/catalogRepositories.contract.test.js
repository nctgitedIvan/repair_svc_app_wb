'use strict';

/** 目錄模組契約測試 —— CloudDB 實作（目前跳過）。 */

const test = require('node:test');
const { runCases } = require('../repositoryContract');
const { serviceCases, productCases } = require('../catalogRepositoryCases');

const enabled = process.env.RUN_CLOUD_CONTRACT === '1';

test(
  'CloudDB 目錄模組契約（需真實雲環境）',
  { skip: !enabled ? '沒有雲環境；設定 RUN_CLOUD_CONTRACT=1 才會執行' : false },
  async (t) => {
    const cloud = require('wx-server-sdk');
    cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

    const { createCloudDBClient } = require('../../../packages/adapters/clouddb/CloudDBClient');
    const { createCloudDBServiceRepository } = require('../../../packages/adapters/clouddb/CloudDBServiceRepository');
    const { createCloudDBProductRepository } = require('../../../packages/adapters/clouddb/CloudDBProductRepository');

    const client = createCloudDBClient(cloud);

    await t.test('Service', async (t2) => {
      await runCases(t2, () => createCloudDBServiceRepository({ client }), serviceCases);
    });

    await t.test('Product', async (t2) => {
      await runCases(t2, () => createCloudDBProductRepository({ client }), productCases);
    });
  },
);
