'use strict';

/**
 * check-frontend.js 的**負向測試**。
 *
 * 沿用 P0 的教訓：**只證明「乾淨的程式碼能通過」沒有意義**。
 * 每個規則都要有一項「故意違反 → 確認被擋」的測試。
 *
 * 因為檢查邏輯是純函式 `checkSource()`，這裡可以直接餵入違規內容，
 * **不需要改動真實檔案**（也就不會有「測試跑完忘了刪暫存檔」的風險）。
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  checkSource, PHONE_CALL_ALLOWLIST, FORBIDDEN_IMPORTS, FORBIDDEN_PERMISSION_TOKENS, SCAN_DIRS,
} = require('../../../scripts/check-frontend');

const has = (violations, keyword) => violations.some((v) => v.why.includes(keyword));

test('⚠️ 規則 1：撥號', async (t) => {
  await t.test('⚠️ 師傅端出現撥號 → 擋下（禁令的直接落實）', () => {
    const v = checkSource('pages/technician/task-detail/index.js', 'wx.makePhoneCall({ phoneNumber: c.phone });');
    assert.equal(v.length, 1);
    assert.ok(has(v, '師傅端絕對禁止撥號'));
  });

  await t.test('⚠️ 未登記的頁面出現撥號 → 擋下', () => {
    const v = checkSource('pages/some-new-page/index.js', 'wx.makePhoneCall({ phoneNumber: "123" });');
    assert.equal(v.length, 1);
    assert.ok(has(v, '未登記在允許清單'));
  });

  await t.test('已登記的頁面 → 放行', () => {
    for (const rel of Object.keys(PHONE_CALL_ALLOWLIST)) {
      assert.deepEqual(checkSource(rel, 'wx.makePhoneCall({ phoneNumber: "x" });'), [], `${rel} 應被放行`);
    }
  });

  await t.test('允許清單的每一項都必須有理由', () => {
    for (const [rel, reason] of Object.entries(PHONE_CALL_ALLOWLIST)) {
      assert.ok(reason && reason.length > 5, `${rel} 缺少理由說明`);
    }
  });

  await t.test('註解中提及 makePhoneCall 不算違規', () => {
    assert.deepEqual(checkSource('pages/technician/x/index.js', '// 我們不使用 wx.makePhoneCall'), []);
    assert.deepEqual(checkSource('pages/technician/x/index.js', ' * 移除了 wx.makePhoneCall'), []);
  });

  await t.test('師傅端即使登記在允許清單也無效（順序：先判斷師傅端）', () => {
    // 萬一有人把師傅端頁面加進白名單，規則 1 的第一個分支仍會擋
    const v = checkSource('pages/technician/evil/index.js', 'wx.makePhoneCall({phoneNumber:1});');
    assert.ok(has(v, '師傅端絕對禁止撥號'));
  });
});

test('⚠️ 規則 2：禁止的 import', async (t) => {
  await t.test('不得 import packages/', () => {
    const v = checkSource('pages/home/home.js', "import { x } from '../../packages/domain/index';");
    assert.ok(has(v, 'packages/'));
  });

  await t.test('不得 import @repair/*', () => {
    const v = checkSource('pages/home/home.js', "const { Order } = require('@repair/domain/order/Order');");
    assert.ok(has(v, '@repair/'));
  });

  await t.test('不得直接 import services/api/real', () => {
    const v = checkSource('pages/home/home.js', "import * as real from '../../services/api/real/index';");
    assert.ok(has(v, 'services/api/index.js'));
  });

  await t.test('不得直接 import services/api/_fake', () => {
    const v = checkSource('pages/home/home.js', "import * as fake from '../../services/api/_fake/index';");
    assert.ok(has(v, 'services/api/index.js'));
  });

  await t.test('透過 services/api/index.js 取資料 → 放行', () => {
    assert.deepEqual(checkSource('pages/home/home.js', "import { fetchServices } from '../../services/api/index';"), []);
  });

  await t.test('每個規則都有 why', () => {
    for (const r of FORBIDDEN_IMPORTS) {
      assert.ok(r.why && r.why.length > 5);
      assert.ok(r.pattern instanceof RegExp);
    }
  });
});

test('⚠️ 規則 3：前端不得判斷權限', async (t) => {
  for (const { pattern, why } of FORBIDDEN_PERMISSION_TOKENS) {
    await t.test(`擋下 ${why}`, () => {
      const sample = `const r = AccessPolicy.can(actor, 'orders.read');`;
      const v = checkSource('pages/cs/index/index.js', sample);
      assert.ok(v.length > 0, `樣本應觸發違規：${pattern}`);
    });
  }

  await t.test('具體：can( 呼叫', () => {
    assert.ok(checkSource('pages/cs/index/index.js', "if (canBool(actor, 'x')) {}").length > 0);
  });

  await t.test('⚠️ 只在 pages/ 檢查（components 可能合法地用到名稱）', () => {
    // 規則 3 的範圍限 pages/ —— 見下一條測試的理由
    const v = checkSource('components/some/index.js', 'const x = AccessPolicy;');
    assert.deepEqual(v, []);
  });

  await t.test('純顯示邏輯 → 放行', () => {
    const ok = "import { isTechnician } from '../../utils/roleVisibility';\nif (isTechnician(role)) { this.setData({ show: true }); }";
    assert.deepEqual(checkSource('pages/home/home.js', ok), []);
  });
});

test('⚠️ 規則 4：repairMode 只允許在頁面層級', async (t) => {
  await t.test('⚠️ 頁面檔的命名不一定是 index.js —— 兩種都要放行', () => {
    assert.deepEqual(checkSource('pages/home/home.js', 'if (config.repairMode) {}'), []);
    assert.deepEqual(checkSource('pages/order/order-list/index.js', 'const m = config.repairMode;'), []);
  });

  await t.test('頁面內的子檔案也放行（仍在 pages/ 底下）', () => {
    assert.deepEqual(checkSource('pages/home/helper.js', 'const m = config.repairMode;'), []);
  });

  await t.test('⚠️ components/ → 擋下', () => {
    const v = checkSource('components/goods-card/index.js', 'if (config.repairMode) {}');
    assert.ok(has(v, 'repairMode 只允許'));
  });

  await t.test('⚠️ services/ → 擋下', () => {
    assert.ok(has(checkSource('services/order/orderList.js', 'const x = config.repairMode;'), 'repairMode 只允許'));
  });

  await t.test('⚠️ utils/ → 擋下', () => {
    assert.ok(has(checkSource('utils/helper.js', 'repairMode'), 'repairMode 只允許'));
  });

  await t.test('⚠️ custom-tab-bar/ → 擋下（那是全站共用，不該有頁面 flag）', () => {
    assert.ok(has(checkSource('custom-tab-bar/index.js', 'if (config.repairMode) {}'), 'repairMode 只允許'));
  });

  await t.test('註解中提及 repairMode 不算違規', () => {
    assert.deepEqual(checkSource('services/x.js', '// 這裡不用 repairMode'), []);
  });
});

test('檢查器自身的性質', async (t) => {
  await t.test('乾淨的內容不產生違規', () => {
    assert.deepEqual(checkSource('pages/home/home.js', "const a = 1;\nPage({});"), []);
  });

  await t.test('空內容不爆', () => {
    assert.deepEqual(checkSource('pages/x/index.js', ''), []);
  });

  await t.test('回報的行號正確', () => {
    const src = 'line1\nline2\nwx.makePhoneCall({});';
    const v = checkSource('pages/technician/x/index.js', src);
    assert.equal(v[0].line, 3);
  });

  await t.test('SCAN_DIRS 涵蓋前端各層', () => {
    for (const dir of ['pages', 'components', 'services', 'utils']) {
      assert.ok(SCAN_DIRS.includes(dir), `應掃描 ${dir}`);
    }
  });

  await t.test('⚠️ 真實專案目前是乾淨的（否則這個檢查器等於沒在用）', () => {
    const { run } = require('../../../scripts/check-frontend');
    assert.equal(run(), 0, '真實專案有前端違規 —— 請修正後再提交');
  });
});
