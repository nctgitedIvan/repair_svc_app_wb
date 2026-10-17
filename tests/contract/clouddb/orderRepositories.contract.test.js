'use strict';

/** 訂單聚合與明細契約測試 —— CloudDB 實作（目前跳過）。 */

const test = require('node:test');
const { runCases } = require('../repositoryContract');
const { orderCases, orderItemCases } = require('../orderRepositoryCases');

const enabled = process.env.RUN_CLOUD_CONTRACT === '1';

test(
  'CloudDB 訂單 Repository 契約（需真實雲環境）',
  { skip: !enabled ? '沒有雲環境；設定 RUN_CLOUD_CONTRACT=1 才會執行' : false },
  async (t) => {
    const cloud = require('wx-server-sdk');
    cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

    const { createCloudDBClient } = require('../../../packages/adapters/clouddb/CloudDBClient');
    const { createCloudDBUnitOfWork } = require('../../../packages/adapters/clouddb/CloudDBUnitOfWork');
    const { createCloudDBOrderRepository } = require('../../../packages/adapters/clouddb/CloudDBOrderRepository');
    const { createCloudDBOrderItemRepository } = require('../../../packages/adapters/clouddb/CloudDBOrderItemRepository');

    const client = createCloudDBClient(cloud);
    const uow = createCloudDBUnitOfWork(client);

    await t.test('Order', async (t2) => {
      await runCases(t2, () => createCloudDBOrderRepository({ client, uow }), orderCases);
    });

    await t.test('OrderItem', async (t2) => {
      await runCases(t2, () => createCloudDBOrderItemRepository({ client }), orderItemCases);
    });
  },
);
