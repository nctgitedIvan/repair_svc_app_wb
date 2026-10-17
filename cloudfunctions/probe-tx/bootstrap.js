'use strict';

/**
 * probe-tx 的共享碼守衛（與其他雲函數一致）。
 * 載入失敗或版本不符 → 函數拒絕啟動。
 */

const manifest = require('@repair/build-manifest');
const pkg = require('./package.json');

function assertSharedBuild() {
  const expected = pkg.repairSharedHash;
  const actual = manifest.hash;
  if (!expected || expected !== actual) {
    throw new Error(
      '[FATAL] 共享碼版本不符，probe-tx 拒絕啟動。' +
        `package.json=${expected || '(未設定)'}，實際=${actual}。` +
        '請在部署前執行 `npm run sync` 並重新部署。',
    );
  }
  return { expected, actual, matches: true };
}

assertSharedBuild();

module.exports = { assertSharedBuild };
