'use strict';

/**
 * 基礎 Repository 的契約案例（P2a-3）。
 *
 * 這些案例只依賴 Port 契約，不依賴任何具體實作 ——
 * 同一個陣列會同時餵給 InMemory 與 CloudDB 的契約測試。
 */

const assert = require('node:assert/strict');
const { GENESIS_HASH, verifyChain } = require('@repair/domain/audit/AuditChain');

const idSequenceCases = [
  {
    name: '從 1 開始、依序遞增',
    async run(repo) {
      assert.equal(await repo.next('order'), 1);
      assert.equal(await repo.next('order'), 2);
      assert.equal(await repo.next('order'), 3);
    },
  },
  {
    name: '不同 key 各自獨立',
    async run(repo) {
      assert.equal(await repo.next('a'), 1);
      assert.equal(await repo.next('b'), 1);
      assert.equal(await repo.next('a'), 2);
      assert.equal(await repo.next('b'), 2);
    },
  },
  {
    name: '⚠️ 併發 50 次不重複（原子遞增）',
    async run(repo) {
      const values = await Promise.all(Array.from({ length: 50 }, () => repo.next('concurrent')));
      assert.equal(new Set(values).size, 50);
      assert.deepEqual([...values].sort((a, b) => a - b), Array.from({ length: 50 }, (_, i) => i + 1));
    },
  },
  {
    name: 'key 不合法 → TypeError',
    async run(repo) {
      await assert.rejects(() => repo.next(''), TypeError);
      await assert.rejects(() => repo.next(null), TypeError);
    },
  },
];

const auditLogCases = [
  {
    name: '第一筆：seq=0、prevHash=GENESIS、hash 64 字元',
    async run(repo) {
      const record = await repo.append('order:ord-1', {
        actorId: 'u1',
        actorRole: 'customer',
        action: 'order.create',
        targetType: 'order',
        targetId: 'ord-1',
        at: 1000,
      });

      assert.equal(record.seq, 0);
      assert.equal(record.prevHash, GENESIS_HASH);
      assert.equal(record.hash.length, 64);
      assert.equal(record.chainId, 'order:ord-1');
    },
  },
  {
    name: '第二筆接在第一筆後面，listByChain 依 seq 升序',
    async run(repo) {
      const first = await repo.append('order:ord-1', { action: 'a', at: 1000 });
      const second = await repo.append('order:ord-1', { action: 'b', at: 2000 });

      assert.equal(second.seq, 1);
      assert.equal(second.prevHash, first.hash);

      const list = await repo.listByChain('order:ord-1');
      assert.deepEqual(list.map((record) => record.seq), [0, 1]);
      assert.equal(list[1].hash, second.hash);
    },
  },
  {
    name: '⚠️ 鏈可通過 domain 的 verifyChain',
    async run(repo) {
      await repo.append('order:ord-1', { action: 'a', at: 1000 });
      await repo.append('order:ord-1', { action: 'b', at: 2000 });
      await repo.append('order:ord-1', { action: 'c', at: 3000 });

      const result = verifyChain(await repo.listByChain('order:ord-1'));
      assert.deepEqual(result, { ok: true, brokenAtSeq: null, reason: null });
    },
  },
  {
    name: '不同 chainId 互不影響',
    async run(repo) {
      const a = await repo.append('order:a', { action: 'a', at: 1 });
      const b = await repo.append('order:b', { action: 'b', at: 2 });
      assert.equal(a.seq, 0);
      assert.equal(b.seq, 0);
      assert.equal((await repo.listByChain('order:a')).length, 1);
      assert.equal((await repo.listByChain('order:b')).length, 1);
    },
  },
  {
    name: '⚠️ 只 append：沒有 update／delete',
    async run(repo) {
      assert.equal(typeof repo.update, 'undefined');
      assert.equal(typeof repo.remove, 'undefined');
      assert.equal(typeof repo.delete, 'undefined');
    },
  },
  {
    name: '參數不合法 → TypeError',
    async run(repo) {
      await assert.rejects(() => repo.append('', { action: 'a' }), TypeError);
      await assert.rejects(() => repo.append('order:1', null), TypeError);
    },
  },
];

const systemConfigCases = [
  {
    name: '找不到 key → 回傳 default（預設 null）',
    async run(repo) {
      assert.equal(await repo.get('missing'), null);
      assert.equal(await repo.get('missing', 42), 42);
    },
  },
  {
    name: 'set 後可讀回（物件）',
    async run(repo) {
      await repo.set('profit_sharing', { technicianRateBp: 8000 });
      assert.deepEqual(await repo.get('profit_sharing'), { technicianRateBp: 8000 });
    },
  },
  {
    name: '再次 set 會覆蓋',
    async run(repo) {
      await repo.set('k', 1);
      await repo.set('k', 2);
      assert.equal(await repo.get('k'), 2);
    },
  },
  {
    name: '回傳值是拷貝，修改不影響內部',
    async run(repo) {
      await repo.set('k', { nested: { value: 1 } });
      const first = await repo.get('k');
      first.nested.value = 999;
      assert.deepEqual(await repo.get('k'), { nested: { value: 1 } });
    },
  },
  {
    name: 'key 不合法 → TypeError',
    async run(repo) {
      await assert.rejects(() => repo.get(''), TypeError);
      await assert.rejects(() => repo.set(null, 1), TypeError);
    },
  },
];

const categoryCases = [
  {
    name: 'save／findById 往返',
    async run(repo) {
      await repo.save({
        categoryId: 'cat_ac',
        name: '空調',
        parentId: null,
        icon: 'ac',
        order: 3,
        isActive: true,
      });

      assert.deepEqual(await repo.findById('cat_ac'), {
        categoryId: 'cat_ac',
        name: '空調',
        parentId: null,
        icon: 'ac',
        order: 3,
        isActive: true,
      });
    },
  },
  {
    name: 'list 依 order 升冪，同序依 name',
    async run(repo) {
      await repo.save({ categoryId: 'b', name: 'B', order: 2 });
      await repo.save({ categoryId: 'a', name: 'A', order: 1 });
      await repo.save({ categoryId: 'c', name: 'C', order: 2 });

      assert.deepEqual((await repo.list()).map((c) => c.categoryId), ['a', 'b', 'c']);
    },
  },
  {
    name: '缺省值：parentId=null、icon=""、order=0、isActive=true',
    async run(repo) {
      await repo.save({ categoryId: 'x', name: 'X' });
      assert.deepEqual(await repo.findById('x'), {
        categoryId: 'x',
        name: 'X',
        parentId: null,
        icon: '',
        order: 0,
        isActive: true,
      });
    },
  },
  {
    name: '再次 save 會覆蓋',
    async run(repo) {
      await repo.save({ categoryId: 'x', name: 'X', order: 1 });
      await repo.save({ categoryId: 'x', name: 'X2', order: 2 });
      assert.equal((await repo.findById('x')).name, 'X2');
      assert.equal((await repo.list()).length, 1);
    },
  },
  {
    name: '找不到 → null',
    async run(repo) {
      assert.equal(await repo.findById('missing'), null);
    },
  },
  {
    name: '參數不合法 → TypeError',
    async run(repo) {
      await assert.rejects(() => repo.save(null), TypeError);
      await assert.rejects(() => repo.save({ categoryId: '', name: 'X' }), TypeError);
      await assert.rejects(() => repo.save({ categoryId: 'x', name: '' }), TypeError);
      await assert.rejects(() => repo.findById(''), TypeError);
    },
  },
];

module.exports = {
  idSequenceCases,
  auditLogCases,
  systemConfigCases,
  categoryCases,
};
