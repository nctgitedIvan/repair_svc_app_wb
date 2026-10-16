#!/usr/bin/env node
'use strict';

/**
 * check-layering.js —— 六角形依賴方向的機械化檢查。
 *
 * 這是 docs/01-目標架構.md §1.6 的可執行版本。
 * 架構規則若不能被腳本檢查，就只是願望。
 *
 * 檢查項目：
 *   1. domain 層禁止的 API（微信雲、資料庫、非確定性時間/隨機、console）
 *   2. ports 層禁止的型別（SDK、雲開發型別、任何實例化）
 *   3. 各層的依賴方向（誰可以 require 誰）
 *   4. 組裝點唯一性（只有 bootstrap.js 可以 new *Adapter）
 *
 * 用法：node scripts/check-layering.js   （違規則 exit 1）
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

/**
 * 每個層允許 require 的套件。null = 不限制（邊界層）。
 *
 * ⚠️ `packages/domain` 例外允許 `crypto`：
 *    `AuditChain` 需要 SHA-256，而 hand-roll 雜湊是更糟的選擇。
 *    `crypto` 是 Node **內建**（非第三方依賴）、且 `createHash` 是**確定性**的。
 *    但 `crypto` 也含非確定性 API（亂數），因此另以 DOMAIN_FORBIDDEN 擋掉那些部分。
 *    ——「放行整個模組但封鎖其中危險的函式」比「整個模組都不准用」更實際，
 *      前提是封鎖清單必須完整且有測試。
 */
const ALLOWED_DEPS = {
  'packages/shared-kernel': [],
  'packages/domain': ['@repair/shared-kernel', 'crypto'],
  'packages/ports': ['@repair/shared-kernel', '@repair/domain'],
  'packages/application': ['@repair/shared-kernel', '@repair/domain', '@repair/ports'],
  // entrypoint-kit 是雲函數入口的中介層：需要 ports（UserRepository 介面）
  // 與 shared-kernel（Result）。不得依賴 adapters —— 它只接收已組裝好的 container。
  'packages/entrypoint-kit': ['@repair/shared-kernel', '@repair/ports'],
  'packages/adapters': null,
};

/** domain 層禁止出現的 API */
const DOMAIN_FORBIDDEN = [
  [/wx-server-sdk/, '微信雲 SDK'],
  [/\bwx\.cloud\b/, 'wx.cloud'],
  [/DYNAMIC_CURRENT_ENV/, '雲開發環境常數'],
  [/cloud\.(database|callFunction|getWXContext)/, '雲開發 API'],
  [/getWXContext/, '微信上下文'],
  [/\.collection\s*\(/, '直接存取資料庫'],
  [/Date\.now\s*\(/, '非確定性時間 → 須改用 ClockPort'],
  [/new\s+Date\s*\(\s*\)/, '非確定性時間 → 須改用 ClockPort'],
  [/Math\.random\s*\(/, '非確定性隨機 → 須改用 IdGeneratorPort'],
  [/process\.env/, '環境變數只能由 adapter 讀'],
  [/console\.(log|error|warn)\s*\(/, '須改用 LoggerPort'],
  // ⚠️ crypto 雖然放行（見 ALLOWED_DEPS 的說明），但其**非確定性**部分必須封鎖。
  //    否則 domain 就能產生無法重現的值，測試與稽核鏈都會失效。
  [/crypto\.(randomBytes|randomUUID|randomFill|randomFillSync|randomInt|generateKeyPair|generateKeyPairSync)/, 'crypto 的亂數 API 不得在 domain 使用（須改用 IdGeneratorPort）'],
  [/\brandomUUID\s*\(/, 'randomUUID 不得在 domain 使用（須改用 IdGeneratorPort）'],
];

/** ports 層禁止出現的型別 */
const PORTS_FORBIDDEN = [
  [/wx-server-sdk/, 'SDK 型別不得滲入介面'],
  [/cloud\.|DYNAMIC_CURRENT_ENV/, '雲開發型別'],
  [/\b(Database|Collection|DocumentReference|ServerDate|Command)\b/, '雲資料庫型別'],
  [/(WeChatPay|WxPay)/, '支付 SDK 型別'],
  [/(axios|node-fetch|require\(['"]https?['"]\))/, 'HTTP client 型別'],
  [/\bnew\s+\w+\s*\(/, 'ports 只能是介面，不得實例化'],
];

const violations = [];

const rel = (p) => path.relative(ROOT, p).replace(/\\/g, '/');
const isTest = (r) => /(^tests\/|\.test\.js$|\.spec\.js$)/.test(r);
const isComment = (line) => /^\s*(\/\/|\*|\/\*)/.test(line);

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules') walk(abs, out);
    } else if (entry.name.endsWith('.js')) {
      out.push(abs);
    }
  }
  return out;
}

function scanForbidden(dirRel, forbidden, label) {
  for (const file of walk(path.join(ROOT, dirRel))) {
    const r = rel(file);
    if (isTest(r)) continue;
    const lines = fs.readFileSync(file, 'utf8').split('\n');
    lines.forEach((line, i) => {
      if (isComment(line)) return;
      for (const [re, why] of forbidden) {
        if (re.test(line)) {
          violations.push({ file: r, line: i + 1, why: `${label}：${why}`, text: line.trim().slice(0, 90) });
        }
      }
    });
  }
}

/** 取套件名（處理子路徑與 scope） */
function packageNameOf(dep) {
  const parts = dep.split('/');
  return dep.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0];
}

function checkDeps(dirRel) {
  const allowed = ALLOWED_DEPS[dirRel];
  if (allowed === null) return;
  for (const file of walk(path.join(ROOT, dirRel))) {
    const r = rel(file);
    if (isTest(r)) continue;
    const lines = fs.readFileSync(file, 'utf8').split('\n');
    lines.forEach((line, i) => {
      if (isComment(line)) return;
      const re = /(?:require\s*\(\s*|from\s+)['"]([^'"]+)['"]/g;
      let m;
      while ((m = re.exec(line))) {
        const dep = m[1];
        if (dep.startsWith('.')) continue; // 相對路徑一律允許

        const pkgName = packageNameOf(dep);
        if (allowed.includes(pkgName)) continue; // 明確允許（含 crypto 這類 Node 內建）

        // 未在允許清單中 → 一律違規（不論是否為 @repair/*）
        const why = allowed.length === 0
          ? `依賴方向：${dirRel} 必須零依賴，不得 require "${dep}"`
          : `依賴方向：${dirRel} 不得依賴 "${pkgName}"（允許：${allowed.join(', ') || '無'}）`;
        violations.push({ file: r, line: i + 1, why, text: line.trim().slice(0, 90) });
      }
    });
  }
}

/**
 * adapters 不得自己寫角色判斷（docs/01 §4.7.0 / §1.6.5）。
 *
 * 脫敏投影必須呼叫 domain 策略（AddressDisclosurePolicy / ContactMaskingPolicy），
 * 不得在 adapter 內複製規則 —— 否則規則會與 domain 走鐘。
 *
 * 只抓「比較」，不抓物件字面量：
 *   ❌ if (viewer.role === 'technician') { ... }        ← 角色判斷
 *   ✅ { viewer: { role: 'technician' }, order, now }   ← 合法傳參
 */
const ROLE_BRANCH_RE = /\.role\s*[!=]==?/;

function checkAdapterRoleBranching() {
  for (const file of walk(path.join(ROOT, 'packages/adapters'))) {
    const r = rel(file);
    if (isTest(r)) continue;
    const lines = fs.readFileSync(file, 'utf8').split('\n');
    lines.forEach((line, i) => {
      if (isComment(line)) return;
      if (ROLE_BRANCH_RE.test(line)) {
        violations.push({
          file: r,
          line: i + 1,
          why: 'adapters 不得判斷角色（應呼叫 domain 的 AddressDisclosurePolicy / ContactMaskingPolicy）',
          text: line.trim().slice(0, 90),
        });
      }
    });
  }
}

/** 只有 bootstrap.js 可以實例化 adapter */
function checkAdapterInstantiation() {
  for (const dirRel of ['cloudfunctions', 'packages']) {
    for (const file of walk(path.join(ROOT, dirRel))) {
      const r = rel(file);
      if (isTest(r) || /bootstrap\.js$/.test(r)) continue;
      const lines = fs.readFileSync(file, 'utf8').split('\n');
      lines.forEach((line, i) => {
        if (isComment(line)) return;
        if (/new\s+\w*Adapter\s*\(/.test(line)) {
          violations.push({
            file: r,
            line: i + 1,
            why: '組裝點唯一性：只有 bootstrap.js 可以 new adapter',
            text: line.trim().slice(0, 90),
          });
        }
      });
    }
  }
}

// ── 執行 ──
scanForbidden('packages/domain', DOMAIN_FORBIDDEN, 'domain');
scanForbidden('packages/ports', PORTS_FORBIDDEN, 'ports');
for (const d of Object.keys(ALLOWED_DEPS)) checkDeps(d);
checkAdapterInstantiation();
checkAdapterRoleBranching();

if (violations.length === 0) {
  console.log('✓ 依賴方向檢查通過（domain / ports / 各層依賴 / 組裝點唯一性 / adapters 無角色判斷）');
  process.exit(0);
}

console.error(`✗ 發現 ${violations.length} 處違規：\n`);
for (const v of violations) {
  console.error(`  ${v.file}${v.line ? ':' + v.line : ''}  [${v.why}]`);
  if (v.text) console.error(`      ${v.text}`);
}
console.error('\n規則說明見 docs/01-目標架構.md §1.6');
process.exit(1);
