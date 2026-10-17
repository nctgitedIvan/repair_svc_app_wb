'use strict';

/** 金流與工單 Repository 契約測試 —— CloudDB 實作（目前跳過）。 */

const test = require('node:test');
const { runCases } = require('../repositoryContract');
const {
  paymentCases,
  refundCases,
  sharingCases,
  workOrderCases,
  workOrderMessageCases,
} = require('../settlementRepositoryCases');

const enabled = process.env.RUN_CLOUD_CONTRACT === '1';

test(
  'CloudDB 金流與工單 Repository 契約（需真實雲環境）',
  { skip: !enabled ? '沒有雲環境；設定 RUN_CLOUD_CONTRACT=1 才會執行' : false },
  async (t) => {
    const cloud = require('wx-server-sdk');
    cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

    const { createCloudDBClient } = require('../../../packages/adapters/clouddb/CloudDBClient');
    const { createCloudDBPaymentRepository } = require('../../../packages/adapters/clouddb/CloudDBPaymentRepository');
    const { createCloudDBRefundRepository } = require('../../../packages/adapters/clouddb/CloudDBRefundRepository');
    const { createCloudDBProfitSharingRepository } = require('../../../packages/adapters/clouddb/CloudDBProfitSharingRepository');
    const { createCloudDBWorkOrderRepository } = require('../../../packages/adapters/clouddb/CloudDBWorkOrderRepository');
    const { createCloudDBWorkOrderMessageRepository } = require('../../../packages/adapters/clouddb/CloudDBWorkOrderMessageRepository');

    const client = createCloudDBClient(cloud);

    await t.test('Payment', async (t2) => {
      await runCases(t2, () => createCloudDBPaymentRepository({ client }), paymentCases);
    });
    await t.test('Refund', async (t2) => {
      await runCases(t2, () => createCloudDBRefundRepository({ client }), refundCases);
    });
    await t.test('ProfitSharing', async (t2) => {
      await runCases(t2, () => createCloudDBProfitSharingRepository({ client }), sharingCases);
    });
    await t.test('WorkOrder', async (t2) => {
      await runCases(t2, () => createCloudDBWorkOrderRepository({ client }), workOrderCases);
    });
    await t.test('WorkOrderMessage', async (t2) => {
      await runCases(t2, () => createCloudDBWorkOrderMessageRepository({ client }), workOrderMessageCases);
    });
  },
);
