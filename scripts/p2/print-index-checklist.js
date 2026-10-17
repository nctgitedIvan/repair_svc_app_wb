#!/usr/bin/env node
'use strict';

/**
 * print-index-checklist.js —— 從 setup-db 的 collections.json 產生
 * 「雲開發 console 手動操作清單」。
 *
 * 為什麼需要手動：
 *   - 微信雲開發 **SDK 不支援建立索引**（只能在 console 設定）。
 *   - 集合權限（僅管理端可讀寫）也必須在 console 逐一確認。
 *
 * 用法：
 *   node scripts/p2/print-index-checklist.js
 *   node scripts/p2/print-index-checklist.js --json
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const MANIFEST_PATH = path.join(ROOT, 'cloudfunctions', 'setup-db', 'collections.json');

function loadManifest(filePath = MANIFEST_PATH) {
  const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  if (!parsed || !Array.isArray(parsed.collections)) {
    throw new Error('collections.json 缺少 collections 陣列');
  }
  return parsed;
}

/**
 * 驗證 manifest。**純函式**，供測試直接呼叫。
 *
 * @returns {{ ok: boolean, errors: string[] }}
 */
function validateManifest(manifest) {
  const errors = [];
  const collections = manifest && Array.isArray(manifest.collections) ? manifest.collections : [];
  if (collections.length !== 22) errors.push(`集合數應為 22，實際 ${collections.length}`);

  const seen = new Set();
  for (const collection of collections) {
    if (!collection || typeof collection.name !== 'string' || collection.name.length === 0) {
      errors.push('有不具名的集合');
      continue;
    }
    if (seen.has(collection.name)) errors.push(`集合重複：${collection.name}`);
    seen.add(collection.name);

    if (!Array.isArray(collection.indexes) || collection.indexes.length === 0) {
      errors.push(`${collection.name} 沒有索引`);
      continue;
    }
    const indexNames = new Set();
    for (const index of collection.indexes) {
      if (!index || typeof index.name !== 'string' || index.name.length === 0) {
        errors.push(`${collection.name} 有未命名的索引`);
        continue;
      }
      if (indexNames.has(index.name)) errors.push(`${collection.name} 索引重複：${index.name}`);
      indexNames.add(index.name);
      if (!Array.isArray(index.fields) || index.fields.length === 0) {
        errors.push(`${collection.name}.${index.name} 沒有欄位`);
      }
      for (const field of index.fields || []) {
        if (!field || typeof field.field !== 'string' || !['asc', 'desc'].includes(field.order)) {
          errors.push(`${collection.name}.${index.name} 欄位格式不合法`);
        }
      }
    }
  }

  return { ok: errors.length === 0, errors };
}

/** 產生 Markdown 清單 */
function formatChecklist(manifest) {
  const lines = [];
  lines.push('# P2 集合／索引／權限核對清單');
  lines.push('');
  lines.push('> 集合由 `setup-db` 雲函數冪等建立；**索引與權限需在雲開發 console 手動完成**。');
  lines.push('> 所有集合的權限一律設為 **「僅管理端可讀寫」**。');
  lines.push('');
  lines.push('| # | 集合 | 索引 | 欄位 | 唯一 |');
  lines.push('|---|---|---|---|:---:|');

  let n = 0;
  for (const collection of manifest.collections) {
    for (const index of collection.indexes) {
      n += 1;
      const fields = index.fields.map((f) => `${f.field} ${f.order}`).join(', ');
      lines.push(`| ${n} | \`${collection.name}\` | \`${index.name}\` | ${fields} | ${index.unique ? '✅' : ''} |`);
    }
  }

  lines.push('');
  lines.push(`共 **${manifest.collections.length}** 個集合、**${n}** 個索引。`);
  return lines.join('\n');
}

function main() {
  const manifest = loadManifest();
  const validation = validateManifest(manifest);
  if (!validation.ok) {
    console.error('✗ collections.json 驗證失敗：');
    for (const error of validation.errors) console.error(`  - ${error}`);
    process.exit(1);
  }

  if (process.argv.includes('--json')) {
    console.log(JSON.stringify(manifest, null, 2));
    return;
  }
  console.log(formatChecklist(manifest));
}

if (require.main === module) {
  main();
}

module.exports = {
  MANIFEST_PATH,
  loadManifest,
  validateManifest,
  formatChecklist,
};
