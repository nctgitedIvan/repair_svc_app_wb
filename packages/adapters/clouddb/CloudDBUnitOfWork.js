'use strict';

/**
 * CloudDBUnitOfWork —— 微信雲開發資料庫的交易邊界。
 *
 * 契約見 `packages/ports/UnitOfWork.js`。
 *
 * 設計要點：
 *  1. 使用 `db.runTransaction()`（衝突時 SDK 會自動重試）。
 *  2. 事務內只允許**單記錄操作**（`doc().get/update/set/remove`、`add`）；
 *     不得使用 `where`／`aggregate`（見 `docs/P2-0-文檔核實報告.md`）。
 *  3. `onCommit` 副作用**只在交易成功後**執行；若交易重試，只保留最後一次
 *     attempt 註冊的 callback，避免重複執行。
 *  4. 交易失敗 → 拋出原錯誤；不會執行任何 `onCommit`。
 *
 * @param {{ db: () => object }} client `CloudDBClient`
 */
function createCloudDBUnitOfWork(client) {
  if (!client || typeof client.db !== 'function') {
    throw new TypeError('createCloudDBUnitOfWork 需要 CloudDBClient');
  }

  const db = client.db();
  if (!db || typeof db.runTransaction !== 'function') {
    throw new TypeError('目前的資料庫不支援 runTransaction（請先確認 P2-0 探針結果）');
  }

  return {
    /**
     * @param {(tx: {
     *   raw: object,
     *   collection: (name: string) => object,
     *   onCommit: (callback: () => void | Promise<void>) => void,
     * }) => Promise<any>} fn
     */
    async run(fn) {
      if (typeof fn !== 'function') throw new TypeError('UnitOfWork.run 需要一個函式');

      // 每次 attempt 重置；runTransaction 重試時只保留最後一次
      let committedCallbacks = [];

      const result = await db.runTransaction(async (rawTransaction) => {
        const attemptCallbacks = [];
        committedCallbacks = attemptCallbacks;

        const tx = {
          raw: rawTransaction,
          collection: (name) => rawTransaction.collection(name),
          onCommit: (callback) => {
            if (typeof callback !== 'function') {
              throw new TypeError('tx.onCommit 需要一個函式');
            }
            attemptCallbacks.push(callback);
          },
        };

        return fn(tx);
      });

      for (const callback of committedCallbacks) {
        await callback();
      }
      return result;
    },
  };
}

module.exports = { createCloudDBUnitOfWork };
