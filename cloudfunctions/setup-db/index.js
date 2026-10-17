'use strict';

/**
 * setup-db —— P2a 的臨時雲函數。
 *
 * 一次上傳同時驗證三件事（使用者 2026-10-17 要求）：
 *   ① 雲函數部署成功
 *   ② `@repair/*` 共享碼在雲端可載入（P0 正式驗收）
 *   ③ 22 個集合建立成功（冪等）
 *
 * ⚠️ 索引與集合權限**無法由 SDK 建立**，仍須在雲開發 console 手動完成；
 *    本函數會把索引清單一併回傳。
 *
 * ⚠️ 使用後刪除本函數（集合保留）。
 */

const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const { assertSharedBuild } = require('./bootstrap');
assertSharedBuild();

const manifest = require('@repair/build-manifest');
const { Money } = require('@repair/shared-kernel/Money');
const { Result } = require('@repair/shared-kernel/Result');

const pkg = require('./package.json');
const collectionsManifest = require('./collections.json');

/** 判斷「集合已存在」的錯誤（不同 SDK 版本的訊息可能不同） */
function isAlreadyExists(err) {
  const text = `${(err && err.code) || ''} ${(err && err.message) || ''}`.toLowerCase();
  return (
    text.includes('already exist') ||
    text.includes('alreadyexist') ||
    text.includes('collection exists') ||
    text.includes('collection_exist')
  );
}

/** 回傳索引清單（給 console 手動建立） */
function indexChecklist() {
  return collectionsManifest.collections.map((collection) => ({
    collection: collection.name,
    indexes: collection.indexes,
  }));
}

exports.main = async (event = {}) => {
  const db = cloud.database();

  // ── ② P0 共享碼檢查 ──
  const sharedBuildChecks = {
    manifestLoaded: !!manifest && typeof manifest.hash === 'string',
    hashMatches: manifest.hash === pkg.repairSharedHash,
    sharedKernelLoaded: Money.fromCents(100).toYuanString() === '1.00',
    resultLoaded: Result.ok(1).ok === true,
  };
  const sharedBuild = {
    hash: manifest.hash,
    hashFromPackageJson: pkg.repairSharedHash,
    builtAt: manifest.builtAt,
    packages: manifest.packages,
    checks: sharedBuildChecks,
  };

  // dryRun：只驗證共享碼與 SDK，不建立集合（第一次部署時建議先用）
  if (event.dryRun === true) {
    return {
      ok: true,
      dryRun: true,
      p0: {
        deployed: true,
        sharedBuildMatches: sharedBuildChecks.hashMatches,
        sharedCodeLoaded: Object.values(sharedBuildChecks).every(Boolean),
      },
      sharedBuild,
      collections: {
        total: collectionsManifest.collections.length,
        created: [],
        existing: [],
        failed: [],
      },
      indexes: indexChecklist(),
    };
  }

  if (typeof db.createCollection !== 'function') {
    return {
      ok: false,
      error: '目前的 wx-server-sdk 不支援 db.createCollection；請在 console 手動建立集合。',
      sharedBuild,
      indexes: indexChecklist(),
    };
  }

  // ── ③ 冪等建立集合 ──
  const created = [];
  const existing = [];
  const failed = [];

  for (const collection of collectionsManifest.collections) {
    try {
      await db.createCollection(collection.name);
      created.push(collection.name);
    } catch (err) {
      if (isAlreadyExists(err)) {
        existing.push(collection.name);
      } else {
        failed.push({
          name: collection.name,
          code: (err && err.code) || null,
          message: (err && err.message) || String(err),
        });
      }
    }
  }

  return {
    ok: failed.length === 0,
    dryRun: false,
    p0: {
      deployed: true,
      sharedBuildMatches: sharedBuildChecks.hashMatches,
      sharedCodeLoaded: Object.values(sharedBuildChecks).every(Boolean),
    },
    sharedBuild,
    collections: {
      total: collectionsManifest.collections.length,
      created,
      existing,
      failed,
      allPresent: failed.length === 0,
    },
    indexes: indexChecklist(),
    nextSteps: [
      '在雲開發 console 依 indexes 清單建立索引（SDK 不支援）。',
      '逐一將 22 個集合的權限設為「僅管理端可讀寫」。',
      '把本函數的回傳 JSON 貼回給 Claude。',
    ],
  };
};
