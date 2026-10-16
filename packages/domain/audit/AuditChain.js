'use strict';

const crypto = require('crypto');
const { canonicalJSON } = require('../shared/canonicalJSON');
const { invariant, assertNonEmptyString } = require('../shared/assertions');

/**
 * AuditChain —— 稽核日誌的哈希鏈。
 *
 * ## 為什麼需要它
 *
 * 微信雲開發的資料庫權限是**集合級「讀／寫」**，**無法做到 insert-only**
 * （見 docs/01 §4.8.0-A 與 `docs/P2-計畫.md` §A-1）。
 * 這代表**管理端仍可 update / delete 稽核日誌**，平台層擋不住。
 *
 * 哈希鏈把「不可能篡改」降級為「**篡改必被偵測**」：
 * 每一筆記錄帶 `prevHash` 與 `hash`，任何修改都會讓後續所有 hash 對不上。
 *
 * ## 分段鏈（Q9 定案）
 *
 * 若用單一全域鏈，並發 append 會分叉。因此：
 *   - **訂單鏈**：`chainId = order:<orderId>` —— 同一訂單的操作天然序列化
 *   - **每日全域鏈**：每日零點產生一筆「當日所有訂單鏈尾的根哈希」
 *   - 驗證時**先驗個別鏈，再驗全域鏈**
 *
 * ## 為何 domain 可以 require('crypto')
 *
 * `crypto` 是 Node **內建**（非第三方依賴），且 `createHash` 是**確定性**的。
 * 相對地，`crypto.randomBytes` 等**非確定性 API 被 check-layering 封鎖** ——
 * 「放行整個模組但封鎖危險函式」比「整個模組都不准用」更實際。
 *
 * 對應 docs/01 §4.7.8、`docs/P2-計畫.md` §A-2／§A-3。
 */

const HASH_ALGO = 'sha256';
const GENESIS_HASH = '0'.repeat(64);

/**
 * 計算單筆稽核記錄的 hash。
 *
 * `hash = sha256(prevHash + canonicalJSON(entry))`
 *
 * 用 `canonicalJSON`（鍵排序、無空白）而非 `JSON.stringify`：
 * 後者的鍵順序取決於插入順序，同一筆語意相同的資料可能產生不同 hash
 * → 稽核鏈**誤報斷點** → 真正被篡改時沒人相信告警。
 *
 * @param {string} prevHash 前一筆的 hash（首筆用 GENESIS_HASH）
 * @param {object} entry 稽核內容（**不含** prevHash 與 hash 本身）
 * @returns {string} 64 字元 hex
 */
function computeHash(prevHash, entry) {
  assertNonEmptyString(prevHash, 'prevHash');
  invariant(entry !== null && typeof entry === 'object', 'entry 必須是物件');

  // 排除自身欄位，避免遞迴
  const { prevHash: _p, hash: _h, ...payload } = entry;

  return crypto
    .createHash(HASH_ALGO)
    .update(prevHash)
    .update(canonicalJSON(payload))
    .digest('hex');
}

/** 建立一筆可寫入的稽核記錄（含 prevHash、hash、seq） */
function appendEntry(prevEntry, entry) {
  const prevHash = prevEntry ? prevEntry.hash : GENESIS_HASH;
  const seq = prevEntry ? prevEntry.seq + 1 : 0;

  const withMeta = { ...entry, seq };
  return { ...withMeta, prevHash, hash: computeHash(prevHash, withMeta) };
}

/**
 * 驗證一條鏈。
 *
 * @param {Array<{seq:number, prevHash:string, hash:string}>} entries 依 seq 升序
 * @returns {{ ok: boolean, brokenAtSeq: number|null, reason: string|null }}
 */
function verifyChain(entries) {
  if (!Array.isArray(entries)) {
    return { ok: false, brokenAtSeq: null, reason: 'NOT_AN_ARRAY' };
  }
  if (entries.length === 0) {
    return { ok: true, brokenAtSeq: null, reason: null };
  }

  let expectedPrev = GENESIS_HASH;

  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];

    if (e.seq !== i) {
      return { ok: false, brokenAtSeq: e.seq, reason: 'SEQ_GAP' };
    }
    if (e.prevHash !== expectedPrev) {
      return { ok: false, brokenAtSeq: e.seq, reason: 'PREV_HASH_MISMATCH' };
    }

    const recomputed = computeHash(e.prevHash, e);
    if (recomputed !== e.hash) {
      return { ok: false, brokenAtSeq: e.seq, reason: 'HASH_MISMATCH' };
    }

    expectedPrev = e.hash;
  }

  return { ok: true, brokenAtSeq: null, reason: null };
}

/**
 * 每日全域鏈的根。
 *
 * 輸入是「當日所有訂單鏈的尾 hash」，排序後再雜湊 ——
 * 順序不影響結果（與 canonicalJSON 同一原則）。
 *
 * @param {string[]} chainTailHashes
 */
function computeDailyRoot(chainTailHashes) {
  if (!Array.isArray(chainTailHashes)) {
    return computeHash(GENESIS_HASH, { chains: [] });
  }
  const sorted = [...chainTailHashes].sort();
  return computeHash(GENESIS_HASH, { chains: sorted });
}

/** 訂單鏈的 chainId */
function orderChainId(orderId) {
  assertNonEmptyString(orderId, 'orderId');
  return `order:${orderId}`;
}

/** 每日全域鏈的 chainId */
function dailyChainId(dateStr) {
  invariant(
    typeof dateStr === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateStr),
    `日期格式必須是 YYYY-MM-DD，收到：${dateStr}`,
  );
  return `daily:${dateStr}`;
}

module.exports = {
  computeHash,
  appendEntry,
  verifyChain,
  computeDailyRoot,
  orderChainId,
  dailyChainId,
  GENESIS_HASH,
  HASH_ALGO,
};
