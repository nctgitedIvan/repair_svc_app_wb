'use strict';

/**
 * Repository 契約測試框架（P2）。
 *
 * 同一組 `cases` 可以對 InMemory 與 CloudDB 兩份實作執行：
 *   - InMemory：本機 `npm test`
 *   - CloudDB：需真實雲環境（`RUN_CLOUD_CONTRACT=1`），目前不跑
 *
 * 每個 case 的 `run(repo)` 會拿到**全新的 repo 實例**，避免測試互相污染。
 */

const test = require('node:test');

/**
 * @param {import('node:test').TestContext} t
 * @param {() => object|Promise<object>} makeRepo
 * @param {Array<{ name: string, run: (repo: object) => Promise<void>|void }>} cases
 */
async function runCases(t, makeRepo, cases) {
  for (const contractCase of cases) {
    await t.test(contractCase.name, async () => {
      const repo = typeof makeRepo === 'function' ? await makeRepo() : makeRepo;
      await contractCase.run(repo);
    });
  }
}

/** 建立一個 top-level 契約測試 */
function defineRepositoryContracts({ name, makeRepo, cases }) {
  test(`${name} 契約`, async (t) => {
    await runCases(t, makeRepo, cases);
  });
}

module.exports = { runCases, defineRepositoryContracts };
