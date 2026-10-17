'use strict';

/**
 * 基礎 Repository 契約測試 —— CloudDB 實作。
 *
 * ⚠️ 目前**跳過**：沒有雲開發環境。
 * 未來在雲函數（contract-test-runner）中設定 `RUN_CLOUD_CONTRACT=1` 後，
 * 同一組 `baseRepositoryCases` 會對 CloudDB 實作執行。
 */

const test = require('node:test');
const { runCases } = require('../repositoryContract');
const {
  idSequenceCases,
  auditLogCases,
  systemConfigCases,
  categoryCases,
} = require('../baseRepositoryCases');

const enabled = process.env.RUN_CLOUD_CONTRACT === '1';

test(
  'CloudDB 基礎 Repository 契約（需真實雲環境）',
  { skip: !enabled ? '沒有雲環境；設定 RUN_CLOUD_CONTRACT=1 才會執行' : false },
  async (t) => {
    // 僅在雲環境中 require，避免本地測試載入 wx-server-sdk
    const cloud = require('wx-server-sdk');
    cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

    const { createCloudDBClient } = require('../../../packages/adapters/clouddb/CloudDBClient');
    const { createCloudDBUnitOfWork } = require('../../../packages/adapters/clouddb/CloudDBUnitOfWork');
    const { createCloudDBIdSequenceRepository } = require('../../../packages/adapters/clouddb/CloudDBIdSequenceRepository');
    const { createCloudDBAuditLogRepository } = require('../../../packages/adapters/clouddb/CloudDBAuditLogRepository');
    const { createCloudDBSystemConfigRepository } = require('../../../packages/adapters/clouddb/CloudDBSystemConfigRepository');
    const { createCloudDBCategoryRepository } = require('../../../packages/adapters/clouddb/CloudDBCategoryRepository');

    const client = createCloudDBClient(cloud);
    const uow = createCloudDBUnitOfWork(client);
    const idSequence = createCloudDBIdSequenceRepository({ client, uow });

    const suffix = `${Date.now()}`;
    const withSuffix = (key) => `__test__:${suffix}:${key}`;

    await t.test('IdSequence', async (t2) => {
      await runCases(t2, () => createCloudDBIdSequenceRepository({ client, uow }), [
        idSequenceCases[0],
        idSequenceCases[1],
        idSequenceCases[3],
      ]);
    });

    await t.test('AuditLog', async (t2) => {
      await runCases(t2, () =>
        createCloudDBAuditLogRepository({
          client,
          idSequence: {
            next: () => idSequence.next(withSuffix('audit')),
          },
        }), [
        auditLogCases[0],
        auditLogCases[1],
        auditLogCases[4],
        auditLogCases[5],
      ]);
    });

    await t.test('SystemConfig', async (t2) => {
      await runCases(t2, () => createCloudDBSystemConfigRepository({ client }), [
        systemConfigCases[1],
        systemConfigCases[2],
      ]);
    });

    await t.test('Category', async (t2) => {
      await runCases(t2, () => createCloudDBCategoryRepository({ client }), [
        categoryCases[0],
        categoryCases[3],
        categoryCases[4],
      ]);
    });

    // TODO(P2d)：清理 __test__ 前綴的資料（contract-test-runner 負責）。
  },
);
