'use strict';

/**
 * API 契約一致性測試。
 *
 * 三個檔案必須匯出同一組方法：
 *   - `services/api/_fake/index.js`（P7a 用）
 *   - `services/api/real/index.js`（P7b 用）
 *   - `services/api/index.js`（頁面唯一入口，逐個轉出）
 *
 * 若只有 fake 加了新方法而 real 忘了加，**P7b 切換時才會炸** ——
 * 而且是在執行期、在真實使用者面前。
 *
 * ⚠️ 這些檔案是 ESM，無法用 require 載入，因此以**文字解析**匯出名稱。
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const API_DIR = path.join(__dirname, '../../../services/api');

/** 從原始碼抽出匯出的函式名稱 */
function exportedNames(relPath) {
  const src = fs.readFileSync(path.join(API_DIR, relPath), 'utf8');
  const names = new Set();

  const patterns = [
    /export\s+async\s+function\s+([A-Za-z_$][\w$]*)/g,
    /export\s+function\s+([A-Za-z_$][\w$]*)/g,
    /export\s+const\s+([A-Za-z_$][\w$]*)/g,
  ];
  for (const re of patterns) {
    let m;
    while ((m = re.exec(src))) names.add(m[1]);
  }
  return names;
}

/** 只保留對外的 API 名稱（排除 demo 輔助函式） */
const isPublicApi = (name) => !name.startsWith('__');

const fakeNames = [...exportedNames('_fake/index.js')].filter(isPublicApi).sort();
const realNames = [...exportedNames('real/index.js')].filter(isPublicApi).sort();
const indexNames = [...exportedNames('index.js')].filter(isPublicApi).sort();

test('⚠️ fake 與 real 必須匯出同一組方法', async (t) => {
  await t.test('兩邊清單完全一致', () => {
    assert.deepEqual(
      realNames,
      fakeNames,
      'fake 與 real 的匯出不一致 —— P7b 切換時會炸\n' +
        `  只在 fake：${fakeNames.filter((n) => !realNames.includes(n)).join(', ') || '無'}\n` +
        `  只在 real：${realNames.filter((n) => !fakeNames.includes(n)).join(', ') || '無'}`,
    );
  });

  await t.test('方法數不為零（避免解析失效而誤判通過）', () => {
    assert.ok(fakeNames.length >= 10, `只解析到 ${fakeNames.length} 個方法，解析可能失效`);
  });
});

test('⚠️ index.js 必須完整轉出（頁面唯一入口）', async (t) => {
  await t.test('轉出清單與 fake 一致', () => {
    assert.deepEqual(
      indexNames,
      fakeNames,
      'index.js 漏了轉出 —— 頁面會取不到該方法\n' +
        `  未轉出：${fakeNames.filter((n) => !indexNames.includes(n)).join(', ') || '無'}`,
    );
  });

  await t.test('index.js 依 apiMode 選擇實作', () => {
    const src = fs.readFileSync(path.join(API_DIR, 'index.js'), 'utf8');
    assert.match(src, /config\.apiMode\s*===\s*'cloud'/);
    assert.match(src, /import \* as fake from '\.\/_fake\/index'/);
    assert.match(src, /import \* as real from '\.\/real\/index'/);
  });
});

test('real 的每個方法都是「明確拋錯」的佔位', async (t) => {
  await t.test('全部經過 notImplemented()，不留空函式', () => {
    const src = fs.readFileSync(path.join(API_DIR, 'real/index.js'), 'utf8');
    // 每一個 export const X = 後面都應該接 notImplemented('X')
    const re = /export\s+const\s+([A-Za-z_$][\w$]*)\s*=\s*notImplemented\(/g;
    const matched = new Set();
    let m;
    while ((m = re.exec(src))) matched.add(m[1]);

    assert.deepEqual(
      [...matched].sort(),
      realNames,
      '有方法不是用 notImplemented() 產生 —— 留空函式會讓 UI 顯示空白，難以診斷',
    );
  });

  await t.test('錯誤訊息指出 P7b', () => {
    const src = fs.readFileSync(path.join(API_DIR, 'real/index.js'), 'utf8');
    assert.match(src, /P7b/);
  });
});

test('契約涵蓋 P7a-2a 需要的商品 API', async (t) => {
  for (const name of ['fetchCategories', 'fetchProducts', 'fetchProductDetail', 'fetchProductCatalogIndex']) {
    await t.test(`含 ${name}`, () => {
      assert.ok(fakeNames.includes(name), `fake 缺少 ${name}`);
      assert.ok(indexNames.includes(name), `index.js 未轉出 ${name}`);
    });
  }
});

test('⚠️ fake 資料必須讓邊界情況可見（人工驗收 C4/C5 的前提）', async (t) => {
  const { PRODUCTS, SERVICES } = require('../../../services/api/_fake/data');

  await t.test('至少有一個庫存為 0 的零件（驗收「已售完」）', () => {
    assert.ok(PRODUCTS.some((p) => p.stock === 0 && p.isActive), '缺少庫存 0 的零件');
  });

  await t.test('至少有一個已下架的零件（驗收「已下架」）', () => {
    assert.ok(PRODUCTS.some((p) => p.isActive === false), '缺少已下架的零件');
  });

  await t.test('至少有一個庫存很少的零件（驗收「庫存不足」）', () => {
    assert.ok(PRODUCTS.some((p) => p.isActive && p.stock > 0 && p.stock <= 3), '缺少庫存很少的零件');
  });

  await t.test('零件形狀含 stock（§3.7.1：零件才有庫存）', () => {
    for (const p of PRODUCTS) {
      assert.ok(Number.isInteger(p.stock), `${p.productId} 缺少 stock`);
    }
  });

  await t.test('至少一個零件有規格（驗收 SKU 切換）', () => {
    assert.ok(PRODUCTS.some((p) => Array.isArray(p.specs) && p.specs.length > 1));
  });

  // 購物車列、商品列表、商品詳情都要顯示圖片（T4 起用）。
  // 少一筆 thumb 就會在畫面上出現破圖，而那種錯在測試裡看不到 —— 所以在此擋下。
  await t.test('每個零件都有非空的 thumb（前端呈現需要）', () => {
    for (const p of PRODUCTS) {
      assert.ok(typeof p.thumb === 'string' && p.thumb.length > 0, `${p.productId} 缺少 thumb`);
    }
  });

  // T6a-3：詳情頁的「詳情介紹」與服務的「技能標籤」都要有資料可顯示。
  await t.test('每個零件都有 description（詳情頁的詳情介紹用）', () => {
    for (const p of PRODUCTS) {
      assert.ok(typeof p.description === 'string' && p.description.length > 0, `${p.productId} 缺少 description`);
    }
  });

  await t.test('每個服務都有 description 與 skillTags（§3.7.1）', () => {
    for (const s of SERVICES) {
      assert.ok(typeof s.description === 'string' && s.description.length > 0, `${s.serviceId} 缺少 description`);
      assert.ok(Array.isArray(s.skillTags) && s.skillTags.length > 0, `${s.serviceId} 缺少 skillTags`);
    }
  });

  await t.test('每個服務都有時長（詳情頁要顯示）', () => {
    for (const s of SERVICES) {
      assert.ok(Number.isInteger(s.durationMinutes) && s.durationMinutes > 0, `${s.serviceId} 缺少 durationMinutes`);
    }
  });
});
