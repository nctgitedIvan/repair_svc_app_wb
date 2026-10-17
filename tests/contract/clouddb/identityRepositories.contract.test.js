'use strict';

/**
 * 身分模組契約測試 —— CloudDB 實作（目前跳過，等真實雲環境）。
 */

const test = require('node:test');
const { runCases } = require('../repositoryContract');
const {
  userCases,
  customerCases,
  csAgentCases,
  technicianCases,
} = require('../identityRepositoryCases');

const enabled = process.env.RUN_CLOUD_CONTRACT === '1';

test(
  'CloudDB 身分模組契約（需真實雲環境）',
  { skip: !enabled ? '沒有雲環境；設定 RUN_CLOUD_CONTRACT=1 才會執行' : false },
  async (t) => {
    const cloud = require('wx-server-sdk');
    cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

    const { createCloudDBClient } = require('../../../packages/adapters/clouddb/CloudDBClient');
    const { createCloudDBUnitOfWork } = require('../../../packages/adapters/clouddb/CloudDBUnitOfWork');
    const { createCloudDBUserRepository } = require('../../../packages/adapters/clouddb/CloudDBUserRepository');
    const { createCloudDBCustomerRepository } = require('../../../packages/adapters/clouddb/CloudDBCustomerRepository');
    const { createCloudDBCsAgentRepository } = require('../../../packages/adapters/clouddb/CloudDBCsAgentRepository');
    const { createCloudDBTechnicianRepository } = require('../../../packages/adapters/clouddb/CloudDBTechnicianRepository');

    const client = createCloudDBClient(cloud);
    const uow = createCloudDBUnitOfWork(client);
    const suffix = `__test__:${Date.now()}`;

    await t.test('User', async (t2) => {
      await runCases(t2, () => createCloudDBUserRepository({ client }), userCases);
    });

    await t.test('Customer', async (t2) => {
      await runCases(
        t2,
        () =>
          createCloudDBCustomerRepository({ client, idPrefix: suffix }),
        customerCases.map((c) => ({
          ...c,
          run: async (repo) => {
            // 測試資料前綴由 adapter 的 idPrefix 處理（未來 contract-test-runner 會清理）
            await c.run(repo);
          },
        })),
      );
    });

    await t.test('CsAgent', async (t2) => {
      await runCases(t2, () => createCloudDBCsAgentRepository({ client, uow }), csAgentCases);
    });

    await t.test('Technician', async (t2) => {
      await runCases(t2, () => createCloudDBTechnicianRepository({ client }), technicianCases);
    });
  },
);
