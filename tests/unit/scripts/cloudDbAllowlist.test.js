'use strict';

/**
 * P2a-2：雲資料庫存取點白名單（check-layering）的負向測試。
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const { checkCloudDBAccess, CLOUD_DB_ALLOWED_FILES } = require('../../../scripts/check-layering');

const ALLOWED_FILE = 'packages/adapters/clouddb/CloudDBClient.js';

test('checkCloudDBAccess：只允許 CloudDBClient.js', async (t) => {
  await t.test('白名單檔案可以使用 cloud.database()／db.collection()', () => {
    assert.ok(CLOUD_DB_ALLOWED_FILES.includes(ALLOWED_FILE));
    const source = [
      'const db = cloud.database();',
      'const users = db.collection("users");',
    ].join('\n');
    assert.deepEqual(checkCloudDBAccess(ALLOWED_FILE, source), []);
  });

  await t.test('⚠️ 其他檔案出現 cloud.database() → 違規', () => {
    const violations = checkCloudDBAccess(
      'packages/adapters/clouddb/CloudDBUserRepository.js',
      'const db = cloud.database();',
    );
    assert.equal(violations.length, 1);
    assert.match(violations[0].why, /CloudDBClient/);
  });

  await t.test('⚠️ 其他檔案出現 db.collection() → 違規', () => {
    const violations = checkCloudDBAccess(
      'packages/adapters/clouddb/CloudDBOrderRepository.js',
      'const rows = db.collection("orders");',
    );
    assert.equal(violations.length, 1);
  });

  await t.test('透過注入的 client 取 collection → 允許', () => {
    const source = 'const rows = client.collection("orders");';
    assert.deepEqual(checkCloudDBAccess('packages/adapters/clouddb/CloudDBOrderRepository.js', source), []);
  });

  await t.test('註解中的字樣不算違規', () => {
    const source = '// 這裡不應該呼叫 cloud.database()\nconst rows = client.collection("orders");';
    assert.deepEqual(checkCloudDBAccess('packages/adapters/clouddb/CloudDBOrderRepository.js', source), []);
  });
});
