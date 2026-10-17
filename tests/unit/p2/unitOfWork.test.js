'use strict';

/**
 * P2a-2：UnitOfWork 的測試。
 *
 * 兩個實作都要符合同一份契約：
 *   - fn 成功 → 回傳值；onCommit 在交易成功後執行
 *   - fn 失敗 → 不執行 onCommit；InMemory 版還原 store
 *   - CloudDB 版在 runTransaction 重試時，只保留最後一次 attempt 的 callback
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const { createCloudDBUnitOfWork } = require('../../../packages/adapters/clouddb/CloudDBUnitOfWork');
const { createInMemoryUnitOfWork } = require('../../../packages/adapters/inmemory/InMemoryUnitOfWork');

function makeCloudClient(runTransaction) {
  return { db: () => ({ runTransaction }) };
}

test('CloudDBUnitOfWork', async (t) => {
  await t.test('fn 成功：回傳值、交易後才執行 onCommit', async () => {
    const order = [];
    const runTransaction = async (fn) =>
      fn({
        collection: (name) => ({ name }),
      });

    const uow = createCloudDBUnitOfWork(makeCloudClient(runTransaction));
    const result = await uow.run(async (tx) => {
      order.push('fn');
      tx.onCommit(() => order.push('commit'));
      return 'ok';
    });

    assert.equal(result, 'ok');
    assert.deepEqual(order, ['fn', 'commit']);
  });

  await t.test('fn 失敗：不執行 onCommit，錯誤往外拋', async () => {
    let committed = false;
    const runTransaction = async (fn) =>
      fn({
        collection: () => ({}),
      });

    const uow = createCloudDBUnitOfWork(makeCloudClient(runTransaction));
    await assert.rejects(
      () =>
        uow.run(async (tx) => {
          tx.onCommit(() => {
            committed = true;
          });
          throw new Error('boom');
        }),
      /boom/,
    );
    assert.equal(committed, false);
  });

  await t.test('⚠️ runTransaction 重試時，只保留最後一次 attempt 的 onCommit', async () => {
    let attempt = 0;
    const committed = [];

    const runTransaction = async (fn) => {
      attempt += 1;
      const tx = { collection: () => ({}) };
      if (attempt === 1) {
        // 第一次：執行 fn（註冊 callback），但模擬衝突失敗
        try {
          await fn(tx);
        } catch (err) {
          // 忽略，進入重試
        }
        return runTransaction(fn);
      }
      return fn(tx);
    };

    const uow = createCloudDBUnitOfWork(makeCloudClient(runTransaction));
    await uow.run(async (tx) => {
      tx.onCommit(() => committed.push(attempt));
      return 'ok';
    });

    assert.deepEqual(committed, [2], '只應執行成功那次 attempt 的 callback');
  });

  await t.test('不支援 runTransaction → 建立時就拋錯', () => {
    assert.throws(() => createCloudDBUnitOfWork({ db: () => ({}) }), /runTransaction/);
    assert.throws(() => createCloudDBUnitOfWork(null), TypeError);
  });

  await t.test('tx.onCommit 需要函式', async () => {
    const runTransaction = async (fn) => fn({ collection: () => ({}) });
    const uow = createCloudDBUnitOfWork(makeCloudClient(runTransaction));
    await assert.rejects(() => uow.run(async (tx) => tx.onCommit(null)), TypeError);
  });
});

test('InMemoryUnitOfWork', async (t) => {
  const makeStore = () => {
    let value = 0;
    return {
      set: (next) => {
        value = next;
      },
      get: () => value,
      snapshot: () => value,
      restore: (snapshot) => {
        value = snapshot;
      },
    };
  };

  await t.test('成功：不還原、執行 onCommit', async () => {
    const store = makeStore();
    const uow = createInMemoryUnitOfWork({ store });
    const order = [];

    const result = await uow.run(async (tx) => {
      store.set(42);
      tx.onCommit(() => order.push('commit'));
      return 'ok';
    });

    assert.equal(result, 'ok');
    assert.equal(store.get(), 42);
    assert.deepEqual(order, ['commit']);
  });

  await t.test('失敗：還原 store、不執行 onCommit', async () => {
    const store = makeStore();
    store.set(7);
    const uow = createInMemoryUnitOfWork({ store });
    let committed = false;

    await assert.rejects(
      () =>
        uow.run(async (tx) => {
          store.set(99);
          tx.onCommit(() => {
            committed = true;
          });
          throw new Error('boom');
        }),
      /boom/,
    );

    assert.equal(store.get(), 7, '應還原到交易前');
    assert.equal(committed, false);
  });

  await t.test('onCommit 失敗不會還原（交易已提交）', async () => {
    const store = makeStore();
    const uow = createInMemoryUnitOfWork({ store });

    await assert.rejects(
      () =>
        uow.run(async (tx) => {
          store.set(5);
          tx.onCommit(() => {
            throw new Error('notify failed');
          });
          return 'ok';
        }),
      /notify failed/,
    );

    assert.equal(store.get(), 5);
  });

  await t.test('store 形狀不對 → TypeError', () => {
    assert.throws(() => createInMemoryUnitOfWork({ store: {} }), TypeError);
  });

  await t.test('沒有 store 也能跑（純 callback 佇列）', async () => {
    const uow = createInMemoryUnitOfWork();
    const result = await uow.run(async () => 'ok');
    assert.equal(result, 'ok');
  });
});
