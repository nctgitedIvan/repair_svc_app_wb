'use strict';

/**
 * bootstrap.js —— setup-db 的 Composition Root（最小版）。
 *
 * 這裡刻意只做一件事：**載入共享碼並驗證版本**。
 * 若 `@repair/build-manifest` 無法載入或版本不符，函數會在啟動時就大聲失敗。
 *
 * 這正是 P0 要驗證的：packages/* 是否真的被同步進雲函數、`@repair/*`
 * 的相對 require 是否正常。
 */

const manifest = require('@repair/build-manifest');
const pkg = require('./package.json');

function assertSharedBuild() {
  const expected = pkg.repairSharedHash;
  const actual = manifest.hash;
  if (!expected || expected !== actual) {
    throw new Error(
      '[FATAL] 共享碼版本不符，setup-db 拒絕啟動。' +
        `package.json=${expected || '(未設定)'}，實際=${actual}。` +
        '請在部署前執行 `npm run sync` 並重新部署。',
    );
  }
  return { expected, actual, matches: true };
}

assertSharedBuild();

module.exports = { assertSharedBuild };
