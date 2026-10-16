'use strict';

/**
 * bootstrap.js —— Composition Root（payment-callback）。
 *
 * 這是**唯一**允許知道「哪個 Port 用哪個 Adapter」的地方。
 * 由 scripts/check-layering.js 強制：其他檔案出現 `new *Adapter(` 一律違規。
 *
 * 為什麼每個雲函數各有一份、不共用：
 *   每個部署單元自己決定依賴，正是 composition root 的意義。
 *   未來 technician-api 可能用完全不同的組合。
 *   共用會把組裝邏輯塞進 entrypoint-kit，反而破壞「只有 bootstrap 可以 new adapter」。
 *   走鐘風險由 tests/unit/composition/containerContract.test.js 守住。
 *
 * P1 階段全部使用 in-memory 實作。P2 起逐步換上 CloudDB*，仍只改本檔。
 */

const manifest = require('@repair/build-manifest');
const pkg = require('./package.json');
const {
  InMemoryOrderRepository,
  InMemoryUserRepository,
  InMemorySettlementAdapter,
  SystemClockAdapter,
  InMemoryLoggerAdapter,
} = require('@repair/adapters');

const SERVICE = 'payment-callback';

/**
 * 共享碼版本守衛。
 *
 * 為什麼要「大聲失敗」而不是降級運行：
 * 若 node_modules/@repair 是舊版，等於用舊的 domain 規則處理金流
 * （例如舊版沒有 DISPUTED 凍結規則）。寧可整個函數無法啟動，
 * 也不要讓錯誤的規則靜默地動到錢。
 */
function assertSharedBuild() {
  const expected = pkg.repairSharedHash;
  const actual = manifest.hash;
  if (!expected || expected !== actual) {
    throw new Error(
      `[FATAL] 共享碼版本不符，${SERVICE} 拒絕啟動。` +
        `package.json=${expected || '(未設定)'}，實際=${actual}。` +
        '請在部署前執行 `npm run sync` 並重新部署。',
    );
  }
}

/**
 * 組裝依賴容器。
 *
 * ⛔ A1 確認前，settlementGateway 一律是 InMemorySettlementAdapter。
 *    禁止換成 WeChatPaySettlementAdapter / PlatformEscrowSettlementAdapter（docs/01 §9.0）。
 */
function buildContainer() {
  return {
    orderRepository: new InMemoryOrderRepository(),
    userRepository: new InMemoryUserRepository(),
    settlementGateway: new InMemorySettlementAdapter(),
    clock: new SystemClockAdapter(),
    logger: new InMemoryLoggerAdapter(),
  };
}

// ── 模組載入即自我檢查 ──
// 刻意放在這裡而不是只放在 index.js：只要任何檔案 require 了 bootstrap
// （組裝依賴的必經之路），守衛就一定會執行，不會因為「忘記在入口呼叫」而靜默失效。
assertSharedBuild();

module.exports = { assertSharedBuild, buildContainer, SERVICE };
