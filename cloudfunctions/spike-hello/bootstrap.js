'use strict';

/**
 * bootstrap.js —— Composition Root。
 *
 * 這是**唯一**允許知道「哪個 Port 用哪個 Adapter」的地方。
 * 由 scripts/check-layering.js 強制：其他檔案出現 `new *Adapter(` 一律違規。
 *
 * 換 adapter（例如把 InMemory 換成 CloudDB、把 fake 支付換成真實支付）
 * 只需要改這個檔案，Use Case 與 domain 零改動。
 */

const manifest = require('@repair/build-manifest');
const pkg = require('./package.json');

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
      '[FATAL] 共享碼版本不符，雲函數拒絕啟動。' +
        `package.json=${expected || '(未設定)'}，實際=${actual}。` +
        '請在部署前執行 `npm run sync` 並重新部署。',
    );
  }
}

/**
 * 組裝依賴容器。
 *
 * P0 階段全部使用 in-memory 實作 —— 這正是 §1.7 第 6 項要驗證的：
 * 不啟動任何外部服務也能組裝出完整的應用。
 * P2 起會逐步把 CloudDB* 換上（仍只改本檔）。
 */
function buildContainer() {
  const { InMemoryOrderRepository, SystemClockAdapter, InMemoryLoggerAdapter } = require('@repair/adapters');
  return {
    orderRepository: new InMemoryOrderRepository(),
    clock: new SystemClockAdapter(),
    logger: new InMemoryLoggerAdapter(),
  };
}

// ── 模組載入即自我檢查 ──
// 刻意放在這裡而不是只放在 index.js：
// 只要任何檔案 require 了 bootstrap（組裝依賴的必經之路），守衛就一定會執行，
// 不會因為「忘記在入口呼叫」而靜默失效。index.js 仍會再呼叫一次，但那是冪等的。
assertSharedBuild();

module.exports = { assertSharedBuild, buildContainer };
