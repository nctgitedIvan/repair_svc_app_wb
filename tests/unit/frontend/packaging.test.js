'use strict';

/**
 * 分包與主包瘦身的機械化護欄。
 *
 * 為什麼要測這個：
 *   主包 2MB 是硬限制，但「哪些頁面在主包」「哪些 TDesign 元件被打包」
 *   光靠人工很容易走鐘 —— 新增一個元件沒登錄 ignore、或把非 tabBar 頁面
 *   放回主包，都不會讓單元測試變紅，直到 DevTools 或上傳時才爆炸。
 *
 * 這組測試把以下規則固定下來：
 *   1. 主包只允許 tabBar 的 5 頁
 *   2. 所有 active 頁面檔案都存在
 *   3. app.json 不得再引用舊電商頁面
 *   4. TDesign 的實際使用閉包＝保留清單；未使用的元件必須被 ignore
 *   5. areaData／addressParse 不得回流主包
 *   6. active 頁面不得導向舊電商路由
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '../../..');
const app = JSON.parse(fs.readFileSync(path.join(ROOT, 'app.json'), 'utf8'));
const project = JSON.parse(fs.readFileSync(path.join(ROOT, 'project.config.json'), 'utf8'));
const ignores = project.packOptions.ignore;

const TD_ROOT = path.join(ROOT, 'miniprogram_npm', 'tdesign-miniprogram');

const LEGACY_PREFIXES = [
  'pages/services/',
  'pages/coupon/',
  'pages/promotion/',
  'pages/goods/search/',
  'pages/goods/result/',
  'pages/goods/comments/',
  'pages/order/receipt/',
  'pages/order/pay-result/',
  'pages/order/order-list/',
  'pages/order/apply-service/',
  'pages/order/after-service-list/',
  'pages/order/after-service-detail/',
  'pages/order/fill-tracking-no/',
  'pages/order/delivery-detail/',
  'pages/order/invoice/',
];

const toPosix = (value) => value.split(path.sep).join('/');

function allPagePaths() {
  const pages = app.pages.map((page) => page);
  for (const subpackage of app.subpackages) {
    for (const page of subpackage.pages) pages.push(`${subpackage.root}/${page}`);
  }
  return pages;
}

function isIgnored(relPath) {
  for (const rule of ignores) {
    const value = rule.value;
    if (rule.type === 'folder' && (relPath === value || relPath.startsWith(`${value}/`))) return true;
    if (rule.type === 'file' && relPath === value) return true;
    if (rule.type === 'suffix' && relPath.endsWith(value)) return true;
    if (rule.type === 'prefix' && relPath.startsWith(value)) return true;
  }
  return false;
}

/** 走訪 active 頁面／自訂 tabBar 的 usingComponents，取得 TDesign 閉包 */
function tdesignClosure() {
  const seen = new Set();
  const used = new Set();

  function walk(jsonPath) {
    if (seen.has(jsonPath) || !fs.existsSync(jsonPath)) return;
    seen.add(jsonPath);

    let json;
    try {
      json = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    } catch {
      return;
    }

    for (const value of Object.values(json.usingComponents || {})) {
      let base;
      if (value.startsWith('tdesign-miniprogram/')) {
        base = path.join(ROOT, 'miniprogram_npm', value);
      } else if (value.startsWith('/')) {
        base = path.join(ROOT, value.slice(1));
      } else {
        base = path.resolve(path.dirname(jsonPath), value);
      }

      const tdPrefix = `${TD_ROOT}${path.sep}`;
      if (base.startsWith(tdPrefix)) {
        used.add(path.relative(TD_ROOT, base).split(path.sep)[0]);
      }
      walk(base.endsWith('.json') ? base : `${base}.json`);
    }
  }

  for (const page of allPagePaths()) walk(path.join(ROOT, `${page}.json`));
  walk(path.join(ROOT, 'custom-tab-bar', 'index.json'));

  return used;
}

test('分包：主包只保留 tabBar 的 5 頁', () => {
  const tabPages = app.tabBar.list.map((item) => item.pagePath);
  assert.deepEqual(app.pages, tabPages, '主包 pages 必須等於 tabBar.list');
});

test('分包：active 頁面檔案齊全', () => {
  for (const page of allPagePaths()) {
    for (const ext of ['.js', '.json', '.wxml', '.wxss']) {
      assert.ok(fs.existsSync(path.join(ROOT, page + ext)), `缺少 ${page}${ext}`);
    }
  }
});

test('分包：app.json 不再引用舊電商頁面', () => {
  for (const page of allPagePaths()) {
    for (const prefix of LEGACY_PREFIXES) {
      assert.equal(page.startsWith(prefix), false, `舊頁面仍在 app.json：${page}`);
    }
  }
  assert.equal(app.pages.includes('pages/services/index'), false, 'services 空殼不應回主包');
});

test('分包：chat／admin 已在分包且路由不變', () => {
  const chat = app.subpackages.find((entry) => entry.root === 'pages/chat');
  const admin = app.subpackages.find((entry) => entry.root === 'pages/admin');
  assert.ok(chat, '缺少 pages/chat 分包');
  assert.ok(admin, '缺少 pages/admin 分包');
  assert.deepEqual(chat.pages, ['index']);
  assert.deepEqual(admin.pages, ['overview/index']);
});

test('TDesign：實際使用閉包必須完整保留（不能被 ignore）', () => {
  const used = tdesignClosure();
  assert.ok(used.size > 0, '閉包不應為空');

  for (const component of used) {
    const relPath = `miniprogram_npm/tdesign-miniprogram/${component}`;
    assert.equal(isIgnored(relPath), false, `使用中的 TDesign 元件被 ignore：${component}`);
  }
});

test('TDesign：未使用的元件目錄必須全部 ignore（不得回流主包）', () => {
  const used = tdesignClosure();
  const keepSupport = new Set(['common', 'mixins']);
  const dirs = fs
    .readdirSync(TD_ROOT, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);

  for (const dir of dirs) {
    if (used.has(dir) || keepSupport.has(dir)) continue;
    const relPath = `miniprogram_npm/tdesign-miniprogram/${dir}`;
    assert.equal(isIgnored(relPath), true, `未使用但未 ignore 的 TDesign 目錄：${dir}`);
  }
});

test('areaData／addressParse 必須在 user 分包內，不得回流主包', () => {
  assert.ok(fs.existsSync(path.join(ROOT, 'pages/user/common/areaData.js')));
  assert.ok(fs.existsSync(path.join(ROOT, 'pages/user/common/addressParse.js')));
  assert.equal(fs.existsSync(path.join(ROOT, 'config/areaData.js')), false);
  assert.equal(fs.existsSync(path.join(ROOT, 'utils/addressParse.js')), false);

  const configSource = fs.readFileSync(path.join(ROOT, 'config/index.js'), 'utf8');
  assert.equal(configSource.includes('areaData'), false, 'config/index.js 不應再轉出 areaData');
});

test('DevTools 自訂編譯條件不得引用舊頁面', () => {
  const conditions = (project.condition && project.condition.miniprogram && project.condition.miniprogram.list) || [];
  for (const condition of conditions) {
    for (const prefix of LEGACY_PREFIXES) {
      assert.equal(
        condition.pathName.startsWith(prefix),
        false,
        `DevTools 條件仍指向舊頁面：${condition.name} → ${condition.pathName}`,
      );
    }
  }
});

test('路由：active 頁面不得導向舊電商頁面', () => {
  const pages = allPagePaths();

  for (const page of pages) {
    const source = fs.readFileSync(path.join(ROOT, `${page}.js`), 'utf8');
    const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
    const matches = code.match(/['"`]\/?pages\/[^'"`\s)]+/g) || [];

    for (const raw of matches) {
      const url = raw.replace(/^['"`]\/?/, '');
      for (const prefix of LEGACY_PREFIXES) {
        assert.equal(
          url.startsWith(prefix),
          false,
          `${page} 仍導向舊頁面：${url}`,
        );
      }
    }
  }
});
