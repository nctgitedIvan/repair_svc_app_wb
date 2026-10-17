'use strict';

/**
 * P2a-2：CloudDBClient 的測試。
 *
 * CloudDBClient 是唯一允許取得 `cloud.database()` 的檔案；
 * 這裡用 fake cloud 驗證它只做「注入 → 取出 db」這件事。
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const { createCloudDBClient } = require('../../../packages/adapters/clouddb/CloudDBClient');

function makeFakeCloud() {
  const db = {
    command: { inc: (n) => ({ $inc: n }) },
    collection: (name) => ({ name }),
  };
  let databaseCalls = 0;
  const cloud = {
    database() {
      databaseCalls += 1;
      return db;
    },
  };
  return { cloud, db, calls: () => databaseCalls };
}

test('createCloudDBClient：注入 cloud，取得 db／command／collection', async (t) => {
  await t.test('只呼叫一次 cloud.database()', () => {
    const { cloud, calls } = makeFakeCloud();
    createCloudDBClient(cloud);
    assert.equal(calls(), 1);
  });

  await t.test('collection(name) 回傳對應的 collection', () => {
    const { cloud } = makeFakeCloud();
    const client = createCloudDBClient(cloud);
    assert.equal(client.collection('users').name, 'users');
  });

  await t.test('command() 回傳 db.command', () => {
    const { cloud, db } = makeFakeCloud();
    const client = createCloudDBClient(cloud);
    assert.equal(client.command(), db.command);
  });

  await t.test('db() 回傳原始 db（供 UnitOfWork 使用）', () => {
    const { cloud, db } = makeFakeCloud();
    const client = createCloudDBClient(cloud);
    assert.equal(client.db(), db);
  });
});

test('createCloudDBClient：參數防護', async (t) => {
  await t.test('沒有 cloud／沒有 database() → TypeError', () => {
    assert.throws(() => createCloudDBClient(null), TypeError);
    assert.throws(() => createCloudDBClient({}), TypeError);
    assert.throws(() => createCloudDBClient({ database: 'nope' }), TypeError);
  });

  await t.test('collection 名稱必須是非空字串', () => {
    const { cloud } = makeFakeCloud();
    const client = createCloudDBClient(cloud);
    assert.throws(() => client.collection(''), TypeError);
    assert.throws(() => client.collection(null), TypeError);
  });
});
