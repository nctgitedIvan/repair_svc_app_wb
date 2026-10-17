'use strict';

/**
 * probe-tx —— P2-0 事務探針（**只寫不跑**）。
 *
 * 未來在 repair-test 環境執行：
 *   { "action": "reset" }        → 歸零
 *   { "action": "tx-write" }     → 10 次併發事務 +1；最終應為 10
 *   { "action": "tx-rollback" }  → 事務內寫入後拋錯；值應不變
 *   { "action": "inc-atomic" }   → 10 次併發 _.inc(1)；最終應為 10
 *   { "action": "rmw-race" }     → 10 次併發「讀→+1→寫」（事務外）；記錄實際值
 *   { "action": "read" }         → 讀目前值
 *
 * 驗證後刪除本函數與 `_probe_tx` 集合。
 */

const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const { assertSharedBuild } = require('./bootstrap');
assertSharedBuild();

const manifest = require('@repair/build-manifest');
const pkg = require('./package.json');

const COLLECTION = '_probe_tx';
const DOC_ID = 'counter';
const CONCURRENCY = 10;

const db = cloud.database();
const command = db.command;

function collectionRef() {
  return db.collection(COLLECTION);
}

async function readValue() {
  try {
    const snapshot = await collectionRef().doc(DOC_ID).get();
    return snapshot && snapshot.data && Number.isInteger(snapshot.data.value)
      ? snapshot.data.value
      : 0;
  } catch (err) {
    return 0;
  }
}

async function writeValue(value) {
  try {
    await collectionRef().doc(DOC_ID).set({ data: { value } });
  } catch (err) {
    // 集合不存在 → 先建立再寫
    if (typeof db.createCollection === 'function') {
      try {
        await db.createCollection(COLLECTION);
      } catch (createErr) {
        /* 已存在就忽略 */
      }
      await collectionRef().doc(DOC_ID).set({ data: { value } });
      return;
    }
    throw err;
  }
}

function sharedBuildInfo() {
  return {
    hash: manifest.hash,
    hashFromPackageJson: pkg.repairSharedHash,
    matches: manifest.hash === pkg.repairSharedHash,
  };
}

exports.main = async (event = {}) => {
  const action = event.action || 'read';
  const result = { action, sharedBuild: sharedBuildInfo() };

  switch (action) {
    case 'reset': {
      await writeValue(0);
      result.value = 0;
      return result;
    }

    case 'read': {
      result.value = await readValue();
      return result;
    }

    case 'tx-write': {
      await Promise.all(
        Array.from({ length: CONCURRENCY }, () =>
          db.runTransaction(async (transaction) => {
            const ref = transaction.collection(COLLECTION).doc(DOC_ID);
            const snapshot = await ref.get();
            const current = snapshot && snapshot.data && Number.isInteger(snapshot.data.value)
              ? snapshot.data.value
              : 0;
            await ref.set({ data: { value: current + 1 } });
          }),
        ),
      );
      result.expected = CONCURRENCY;
      result.value = await readValue();
      result.pass = result.value === CONCURRENCY;
      return result;
    }

    case 'tx-rollback': {
      const before = await readValue();
      try {
        await db.runTransaction(async (transaction) => {
          const ref = transaction.collection(COLLECTION).doc(DOC_ID);
          await ref.set({ data: { value: 9999 } });
          throw new Error('probe-tx intentional rollback');
        });
      } catch (err) {
        result.rollbackError = err.message;
      }
      const after = await readValue();
      result.before = before;
      result.after = after;
      result.pass = before === after;
      return result;
    }

    case 'inc-atomic': {
      await Promise.all(
        Array.from({ length: CONCURRENCY }, () =>
          collectionRef()
            .doc(DOC_ID)
            .update({ data: { value: command.inc(1) } }),
        ),
      );
      result.expected = CONCURRENCY;
      result.value = await readValue();
      result.pass = result.value === CONCURRENCY;
      return result;
    }

    case 'rmw-race': {
      await Promise.all(
        Array.from({ length: CONCURRENCY }, async () => {
          const current = await readValue();
          await writeValue(current + 1);
        }),
      );
      result.expected = CONCURRENCY;
      result.value = await readValue();
      result.note = '若 value < expected，代表無事務的讀-改-寫會丟更新';
      return result;
    }

    default:
      return { ...result, ok: false, error: `未知 action：${action}` };
  }
};
