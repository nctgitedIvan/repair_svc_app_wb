'use strict';

/**
 * P2a-1：集合 manifest 與索引清單的測試。
 *
 * 這些測試保護的是「建立集合前的最後一道防線」：
 * 少一個集合、少一個唯一索引，P5 上線後才會發現，代價很高。
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const checklist = require('../../../scripts/p2/print-index-checklist');

const manifest = checklist.loadManifest();

const names = manifest.collections.map((collection) => collection.name);
const indexOf = (collectionName) => {
  const collection = manifest.collections.find((entry) => entry.name === collectionName);
  assert.ok(collection, `manifest 缺少集合 ${collectionName}`);
  return collection.indexes;
};
const hasUnique = (collectionName, fieldNames) =>
  indexOf(collectionName).some(
    (index) =>
      index.unique === true &&
      index.fields.length === fieldNames.length &&
      index.fields.every((f, i) => f.field === fieldNames[i]),
  );

test('集合 manifest：22 個集合，名稱不重複', async (t) => {
  await t.test('總數是 22', () => {
    assert.equal(manifest.collections.length, 22);
  });

  await t.test('名稱不重複', () => {
    assert.equal(new Set(names).size, names.length);
  });

  await t.test('包含 §7.1 的全部集合', () => {
    const expected = [
      'users', 'customers', 'cs_agents', 'technicians',
      'categories', 'services', 'products', 'carts', 'inquiries', 'favorites',
      'orders', 'order_items', 'order_status_logs',
      'payment_records', 'profit_sharing_records', 'profit_sharing_return_records', 'refund_records',
      'work_order_tickets', 'work_order_messages',
      'audit_logs', 'system_configs', 'id_sequences',
    ];
    assert.deepEqual([...names].sort(), [...expected].sort());
  });

  await t.test('每個集合都有至少一個索引，且欄位格式正確', () => {
    for (const collection of manifest.collections) {
      assert.ok(collection.indexes.length > 0, `${collection.name} 沒有索引`);
      for (const index of collection.indexes) {
        assert.ok(index.name, `${collection.name} 有索引沒有名稱`);
        assert.ok(index.fields.length > 0, `${collection.name}.${index.name} 沒有欄位`);
        for (const field of index.fields) {
          assert.ok(['asc', 'desc'].includes(field.order), `${collection.name}.${index.name} 的 order 不合法`);
        }
      }
    }
  });
});

test('唯一索引：冪等鍵與身分鍵一個都不能少', async (t) => {
  await t.test('冪等鍵（微信支付回調重複送達的最後防線）', () => {
    assert.equal(hasUnique('payment_records', ['out_trade_no']), true);
    assert.equal(hasUnique('profit_sharing_records', ['out_order_no']), true);
    assert.equal(hasUnique('refund_records', ['out_refund_no']), true);
  });

  await t.test('身分／單號／唯一資源', () => {
    assert.equal(hasUnique('users', ['openid']), true);
    assert.equal(hasUnique('customers', ['user_id']), true);
    assert.equal(hasUnique('cs_agents', ['user_id']), true);
    assert.equal(hasUnique('technicians', ['user_id']), true);
    assert.equal(hasUnique('carts', ['user_id']), true);
    assert.equal(hasUnique('favorites', ['customer_id', 'product_id']), true);
    assert.equal(hasUnique('orders', ['order_no']), true);
    assert.equal(hasUnique('work_order_tickets', ['order_id']), true);
    assert.equal(hasUnique('system_configs', ['key']), true);
    assert.equal(hasUnique('id_sequences', ['key']), true);
  });
});

test('print-index-checklist：驗證與輸出', async (t) => {
  await t.test('manifest 驗證通過', () => {
    assert.deepEqual(checklist.validateManifest(manifest), { ok: true, errors: [] });
  });

  await t.test('缺少集合／重複索引會被抓到', () => {
    const broken = {
      collections: [
        { name: 'a', indexes: [{ name: 'i', unique: false, fields: [{ field: 'x', order: 'asc' }] }] },
        { name: 'a', indexes: [] },
      ],
    };
    const result = checklist.validateManifest(broken);
    assert.equal(result.ok, false);
    assert.ok(result.errors.some((e) => e.includes('集合數')));
    assert.ok(result.errors.some((e) => e.includes('重複')));
  });

  await t.test('Markdown 清單包含 22 集合與權限提醒', () => {
    const output = checklist.formatChecklist(manifest);
    for (const name of names) {
      assert.ok(output.includes(name), `清單缺少 ${name}`);
    }
    assert.ok(output.includes('僅管理端可讀寫'));
    assert.ok(output.includes('22'));
  });
});
