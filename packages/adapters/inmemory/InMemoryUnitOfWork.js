'use strict';

/**
 * InMemoryUnitOfWork —— 測試用的交易邊界。
 *
 * 契約見 `packages/ports/UnitOfWork.js`。
 *
 * 與 CloudDB 版的行為對齊：
 *  - `fn` 拋錯 → 還原 store（若有提供 snapshot／restore）且**不執行** onCommit。
 *  - `fn` 成功 → 執行 onCommit；onCommit 失敗**不會**還原（交易已提交）。
 *
 * @param {{ store?: { snapshot: () => any, restore: (snapshot: any) => void } }} [options]
 */
function createInMemoryUnitOfWork({ store } = {}) {
  if (store && (typeof store.snapshot !== 'function' || typeof store.restore !== 'function')) {
    throw new TypeError('InMemoryUnitOfWork 的 store 必須有 snapshot() 與 restore()');
  }

  return {
    async run(fn) {
      if (typeof fn !== 'function') throw new TypeError('UnitOfWork.run 需要一個函式');

      const snapshot = store ? store.snapshot() : null;
      const onCommit = [];
      const tx = {
        onCommit: (callback) => {
          if (typeof callback !== 'function') {
            throw new TypeError('tx.onCommit 需要一個函式');
          }
          onCommit.push(callback);
        },
      };

      let result;
      try {
        result = await fn(tx);
      } catch (err) {
        if (store) store.restore(snapshot);
        throw err;
      }

      for (const callback of onCommit) {
        await callback();
      }
      return result;
    },
  };
}

module.exports = { createInMemoryUnitOfWork };
