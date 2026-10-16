#!/usr/bin/env node
'use strict';

/**
 * check-frontend.js —— 前端專屬的架構與資安檢查。
 *
 * 為什麼前端的規則要另外檢查（而不是併進 check-layering）：
 *   check-layering 管的是 `packages/` 的**依賴方向**；
 *   這裡管的是 `pages/`、`components/`、`services/` 的**行為紅線**。
 *   兩者的對象與失敗後果不同，分開比較清楚。
 *
 * **設計要點**：核心邏輯是純函式 `checkSource(relPath, source)`，
 * 讓負向測試可以直接餵入違規內容，**不需要改動真實檔案**。
 * （沿用 P0 的教訓：檢查器本身必須被測試，否則漏洞沒人知道。）
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

/**
 * ⚠️ `wx.makePhoneCall` 的**允許清單**。
 *
 * 為什麼用白名單而非全面禁止：撥號本身不是問題，
 * **「撥給客戶」才是**。禁止所有撥號會擋掉「客戶打給客服」這種合理需求，
 * 而那種規則最後一定會被繞過或放寬。
 *
 * 白名單強迫每次新增撥號都必須**明示意圖**並登錄於此。
 */
const PHONE_CALL_ALLOWLIST = Object.freeze({
  'pages/usercenter/index.js': '客戶主動撥打平台客服電話（非客戶號碼，非師傅端）',
  'pages/order/delivery-detail/index.js': '撥打快遞員電話；物流已下線（A7），此頁不可達',
});

/** 師傅端所有頁面都不得有撥號能力 —— 這是禁令的直接落實 */
const TECHNICIAN_DIR = 'pages/technician/';

/** 前端不得引用的領域／權限模組 */
const FORBIDDEN_IMPORTS = Object.freeze([
  { pattern: /(?:from|require\()\s*['"][^'"]*packages\//, why: '前端不得引用 packages/（domain 不得進前端 bundle）' },
  { pattern: /(?:from|require\()\s*['"]@repair\//, why: '前端不得引用 @repair/*（domain 不得進前端 bundle）' },
  { pattern: /(?:from|require\()\s*['"][^'"]*services\/api\/(?:real|_fake)/, why: '頁面只能透過 services/api/index.js 取資料' },
]);

/** 前端不得出現的權限概念 */
const FORBIDDEN_PERMISSION_TOKENS = Object.freeze([
  { pattern: /\bAccessPolicy\b/, why: '前端不得判斷權限（後端才有 AccessPolicy）' },
  { pattern: /\bcanBool\s*\(/, why: '前端不得判斷權限' },
  { pattern: /\ballowedPermissions\s*\(/, why: '前端不得判斷權限' },
  { pattern: /\bRolePermissionMatrix\b/, why: '前端不得引用權限矩陣' },
]);

/** 被檢查的目錄（相對專案根） */
const SCAN_DIRS = Object.freeze(['pages', 'components', 'custom-tab-bar', 'services', 'utils']);

const isComment = (line) => /^\s*(\/\/|\*|\/\*|<!--)/.test(line);

/**
 * 檢查單一檔案的內容。**純函式**，供測試直接呼叫。
 *
 * @param {string} relPath 相對專案根的路徑（用 `/` 分隔）
 * @param {string} source 檔案內容
 * @returns {Array<{ file: string, line: number, why: string, text: string }>}
 */
function checkSource(relPath, source) {
  const violations = [];
  const lines = source.split('\n');
  const isTechnician = relPath.startsWith(TECHNICIAN_DIR);
  const isPage = relPath.startsWith('pages/');

  const report = (line, why, text) => {
    violations.push({ file: relPath, line, why, text: String(text).trim().slice(0, 90) });
  };

  lines.forEach((line, i) => {
    if (isComment(line)) return; // 註解中提及這些名稱是為了說明，不算違規

    // ── 規則 1：撥號 ──
    if (/wx\s*\.\s*makePhoneCall/.test(line)) {
      if (isTechnician) {
        report(i + 1, '師傅端絕對禁止撥號（不得直接聯絡客戶）', line);
      } else if (!Object.prototype.hasOwnProperty.call(PHONE_CALL_ALLOWLIST, relPath)) {
        report(
          i + 1,
          `wx.makePhoneCall 未登記在允許清單（新增撥號前請先確認對象不是客戶，再登錄於 scripts/check-frontend.js）`,
          line,
        );
      }
    }

    // ── 規則 2：禁止的 import ──
    for (const { pattern, why } of FORBIDDEN_IMPORTS) {
      if (pattern.test(line)) {
        report(i + 1, why, line);
        break;
      }
    }

    // ── 規則 3：權限概念 ──
    if (isPage) {
      for (const { pattern, why } of FORBIDDEN_PERMISSION_TOKENS) {
        if (pattern.test(line)) {
          report(i + 1, why, line);
          break;
        }
      }
    }

    // ── 規則 4：repairMode 只允許在頁面層級 ──
    // 「頁面層級」= pages/ 底下的 .js。頁面檔的命名不一定是 index.js
    // （例如 pages/home/home.js），所以不寫死檔名。
    // 真正的目的是**阻止它散佈到 components / services / utils** ——
    // 那些地方一旦有 flag，就會變成「到處都是 if」。
    if (/\brepairMode\b/.test(line) && !isPage) {
      report(
        i + 1,
        'repairMode 只允許出現在 pages/ 底下（避免散佈到 components／services／utils）',
        line,
      );
    }
  });

  return violations;
}

/** 遞迴收集要檢查的檔案 */
function collectFiles(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === 'miniprogram_npm') continue;
      collectFiles(abs, out);
    } else if (/\.(js|wxml)$/.test(entry.name)) {
      out.push(abs);
    }
  }
  return out;
}

function run() {
  const violations = [];

  for (const dir of SCAN_DIRS) {
    for (const abs of collectFiles(path.join(ROOT, dir))) {
      const rel = path.relative(ROOT, abs).replace(/\\/g, '/');
      violations.push(...checkSource(rel, fs.readFileSync(abs, 'utf8')));
    }
  }

  if (violations.length === 0) {
    console.log(`✓ 前端檢查通過（撥號白名單 / 無 packages 引用 / 無權限判斷 / repairMode 範圍）`);
    return 0;
  }

  console.error(`✗ 發現 ${violations.length} 處前端違規：\n`);
  for (const v of violations) {
    console.error(`  ${v.file}:${v.line}  [${v.why}]`);
    if (v.text) console.error(`      ${v.text}`);
  }
  console.error('\n規則說明見 docs/04-前端規範.md');
  return 1;
}

if (require.main === module) {
  process.exit(run());
}

module.exports = {
  checkSource,
  run,
  PHONE_CALL_ALLOWLIST,
  FORBIDDEN_IMPORTS,
  FORBIDDEN_PERMISSION_TOKENS,
  SCAN_DIRS,
  TECHNICIAN_DIR,
};
