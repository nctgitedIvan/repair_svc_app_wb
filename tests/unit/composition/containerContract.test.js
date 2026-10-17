'use strict';

/**
 * 四支雲函數的 composition root 契約測試。
 *
 * 為什麼需要它：4 份 bootstrap.js 是刻意的重複（每個部署單元自己決定依賴），
 * 但重複就會走鐘 —— 有人加了新依賴只改其中一支，另一支就會在執行期才炸。
 * 這個測試把「四支必須一致」變成機械化的斷言。
 *
 * 這也是 P1-計畫 §9 P1-R2 的對策。
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '../../..');
const FN_DIR = path.join(ROOT, 'cloudfunctions');

/**
 * 四支業務 API（P5 路由）＋ 兩支系統函數（spike-hello 是 P0 驗證端點，不在此契約內）。
 *
 * 四支業務 API 共用完整 container；payment-callback／scheduled-jobs 目前只需要
 * 健康檢查的最小依賴，因此**不列入「鍵完全相同」的比較**。
 */
const API_FUNCTIONS = ['customer-api', 'technician-api', 'cs-api', 'admin-api'];
const SYSTEM_FUNCTIONS = ['payment-callback', 'scheduled-jobs'];
const SKELETON_FUNCTIONS = [...API_FUNCTIONS, ...SYSTEM_FUNCTIONS];

/**
 * container 契約：每個鍵必須存在，且具備 Port 契約宣告的方法。
 * 這把 adapter 實作與 ports 介面綁在一起 —— 少一個方法就會紅。
 */
const CONTAINER_CONTRACT = {
  orderRepository: ['findById', 'findByOrderNo', 'save', 'findExpiredUnpaid', 'findExpiredUnassigned'],
  userRepository: ['findByOpenid', 'findById', 'updateLastLogin'],
  settlementGateway: ['capabilities', 'onPaymentSuccess', 'settle', 'beforeRefund', 'refund', 'querySettlement'],
  clock: ['now'],
  logger: ['debug', 'info', 'warn', 'error'],
};

function loadBootstrap(name) {
  return require(path.join(FN_DIR, name, 'bootstrap.js'));
}

test('composition：四支骨架雲函數都存在', async (t) => {
  for (const name of SKELETON_FUNCTIONS) {
    await t.test(`${name} 目錄與三檔齊全`, () => {
      const dir = path.join(FN_DIR, name);
      assert.ok(fs.existsSync(dir), `${name} 目錄不存在`);
      for (const file of ['index.js', 'bootstrap.js', 'package.json']) {
        assert.ok(fs.existsSync(path.join(dir, file)), `${name}/${file} 不存在`);
      }
    });
  }

  await t.test('P5 路由所需的 cs-api / admin-api 已建立', () => {
    for (const name of ['cs-api', 'admin-api']) {
      assert.equal(fs.existsSync(path.join(FN_DIR, name)), true, `${name} 應存在（P5 雲函數路由）`);
    }
  });
});

test('composition：每個 bootstrap 產出的 container 都滿足契約', async (t) => {
  for (const name of SKELETON_FUNCTIONS) {
    await t.test(`${name} 的 container 完整`, () => {
      const { buildContainer } = loadBootstrap(name);
      const container = buildContainer();

      for (const [key, methods] of Object.entries(CONTAINER_CONTRACT)) {
        assert.ok(container[key], `${name} 缺少依賴：${key}`);
        for (const method of methods) {
          assert.equal(
            typeof container[key][method],
            'function',
            `${name}.${key} 缺少方法 ${method}（與 ports 契約不符）`,
          );
        }
      }
    });
  }

  await t.test('⚠️ 四支業務 API 的依賴鍵必須完全相同（防走鐘）', () => {
    const shapes = API_FUNCTIONS.map((name) => {
      const container = loadBootstrap(name).buildContainer();
      return { name, keys: Object.keys(container).sort().join(',') };
    });
    const first = shapes[0];
    for (const s of shapes.slice(1)) {
      assert.equal(
        s.keys,
        first.keys,
        `${s.name} 的依賴鍵與 ${first.name} 不一致：\n  ${first.name}: ${first.keys}\n  ${s.name}: ${s.keys}`,
      );
    }
  });
});

test('composition：SERVICE 常數與目錄名一致', async (t) => {
  for (const name of SKELETON_FUNCTIONS) {
    await t.test(`${name}`, () => {
      assert.equal(loadBootstrap(name).SERVICE, name, 'SERVICE 與目錄名不符，健康檢查會回報錯誤的服務名');
    });
  }
});

test('composition：共享碼守衛', async (t) => {
  for (const name of SKELETON_FUNCTIONS) {
    await t.test(`${name} 暴露 assertSharedBuild 且載入時不拋錯`, () => {
      const mod = loadBootstrap(name);
      assert.equal(typeof mod.assertSharedBuild, 'function');
      // require 本身就已經執行了 assertSharedBuild()；能載到這裡代表通過
      assert.doesNotThrow(() => mod.assertSharedBuild());
    });

    await t.test(`${name} 的 package.json 有 repairSharedHash`, () => {
      const pkg = require(path.join(FN_DIR, name, 'package.json'));
      assert.match(pkg.repairSharedHash || '', /^[a-f0-9]{64}$/, 'repairSharedHash 格式不正確或未同步');
    });
  }
});

test('composition：P1 階段不得出現真實金流 adapter', async (t) => {
  await t.test('adapters 目錄無 WeChatPay / CloudPay / PlatformEscrow', () => {
    const adaptersDir = path.join(ROOT, 'packages', 'adapters');
    const found = [];
    (function walk(dir) {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) walk(p);
        else if (/WeChatPay|CloudPay|PlatformEscrow|WeChatProfitSharing/.test(e.name)) found.push(e.name);
      }
    })(adaptersDir);

    assert.deepEqual(found, [], `A1 確認前不得實作真實金流 adapter，發現：${found.join(', ')}`);
  });

  await t.test('四支的 settlementGateway 皆為 in-memory 模式', () => {
    for (const name of SKELETON_FUNCTIONS) {
      const container = loadBootstrap(name).buildContainer();
      const caps = container.settlementGateway.capabilities();
      assert.equal(caps.settlementMode, 'PROFIT_SHARING', 'P1 應以主方案能力宣告，但實作是 in-memory');
      // InMemory 的特徵：可被測試輔助方法操作
      assert.equal(typeof container.settlementGateway.completePending, 'function');
    }
  });
});
