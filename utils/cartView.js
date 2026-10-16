/**
 * 購物車的畫面組裝（純函式）。
 *
 * ## 為什麼要有這一層
 *
 * 「購物車 × 商品現況 → 畫面」的組合邏輯如果寫在頁面裡，**CI 就驗不到**
 * （`npm test` 不執行 `pages/`，元件更無法在 Node 裡跑）。
 * 抽成純函式後，那條邏輯可以在 `tests/unit/frontend/cartView.test.js` 被驗證。
 *
 * ## 與 `utils/cart.js` 的分工
 *
 * | 模組 | 負責 |
 * |---|---|
 * | `utils/cart.js` | **規則**：什麼能加入、數量上限、結算前校驗（`validate`）、金額加總 |
 * | `utils/cartView.js`（本檔） | **呈現**：把規則的結果組成畫面要的形狀（分組、標籤文字、view model） |
 *
 * ⚠️ **本檔不重新實作任何規則** —— 分組用的問題碼來自 `cart.validate()`，
 *    金額與件數來自 `cart.totalCents()` / `cart.totalQuantity()`。
 *    規則只有一份，改規則只需改 `cart.js`。
 *
 * ## 兩個刻意的設計
 *
 * 1. **view model 的欄位名配合既有呈現元件**（`pages/cart/components/goods-card`）。
 *    保留該元件、不改其結構，是 P7a-2a T4 的決策（見 `docs/P7a-2a-T4-計畫.md` §6.1）：
 *    重寫元件等於連帶重寫 335 行已調好的樣式，風險大於收益。
 *    這個「配合」集中在 `toLine()` 一處，並在此說明。
 *
 * 2. **`isSelected` 是畫面狀態，不進 Storage**。
 *    `utils/cart.js` 的 schema 要對齊後端，而後端不會存「這次勾了哪些」。
 */

const cartRules = require('./cart');
const { CartCode, BLOCKING_CODES, MAX_LINE_QUANTITY } = require('./cartCodes');

/** 問題碼 → 顯示文字（呈現層的事，所以放這裡而不是 cartCodes.js） */
const ISSUE_TEXT = Object.freeze({
  [CartCode.OUT_OF_STOCK]: '已售完',
  [CartCode.DELISTED]: '已下架',
  [CartCode.PRODUCT_NOT_FOUND]: '商品已不存在',
  [CartCode.PRICE_CHANGED]: '價格已變動',
});

/**
 * 問題碼 → **縮圖遮罩上的短文字**。
 *
 * 遮罩是一個 128rpx 的圓形（`.no-storage-mask`），塞不下「商品已不存在」這種長句，
 * 因此另外準備一份短的。完整說明仍由 `issueText` 顯示在標題下方。
 */
const ISSUE_SHORT_TEXT = Object.freeze({
  [CartCode.OUT_OF_STOCK]: '已售完',
  [CartCode.DELISTED]: '已下架',
  [CartCode.PRODUCT_NOT_FOUND]: '已失效',
  [CartCode.PRICE_CHANGED]: '已變價',
});

/** 金額（分）→ 顯示文字（例：2500 → `25.00`；`goods-card` 的 price 元件吃的是分，這裡給純文字） */
function formatCents(cents) {
  if (!Number.isInteger(cents)) return '';
  return (cents / 100).toFixed(2);
}

/**
 * 舊結算頁（`pages/order/order-confirm`）的相容橋接用常數。
 *
 * ⚠️ 維修場景**只有一個平台**，沒有電商的多門店概念；
 *    但舊結算頁用它來分組，因此固定給一個值。見 `toLegacyGoodsRequest()`。
 */
const LEGACY_STORE_ID = '1000';
const LEGACY_STORE_NAME = '維修服務平台';

/** 商品現況取不到時的顯示 */
const MISSING_TITLE = '（商品已不存在）';

/** 單一明細的數量上限（與 cartCodes 一致；庫存未知時用它當上限） */
function maxQuantityOf(product) {
  if (product && Number.isInteger(product.stock)) {
    return Math.min(product.stock, MAX_LINE_QUANTITY);
  }
  return MAX_LINE_QUANTITY;
}

/** 已選規格的顯示名稱（`goods-card` 吃 string[]） */
function specNamesOf(product, item) {
  if (!item.specId || !product || !Array.isArray(product.specs)) return [];
  const spec = product.specs.find((s) => s.specId === item.specId);
  return spec ? [spec.name] : [];
}

/**
 * 組出一筆明細的 view model。
 *
 * @param {object} item `utils/cart.js` 的明細（原始資料）
 * @param {object|null} product 商品現況（取不到為 null）
 * @param {{code: string}|null} issue `cart.validate()` 對這筆的問題
 * @param {boolean} isSelected
 */
function toLine(item, product, issue, isSelected) {
  const missing = !product;
  const code = issue ? issue.code : null;
  const currentPriceCents = missing || !Number.isInteger(product.priceCents) ? null : product.priceCents;
  return {
    // ── 識別 ──
    lineId: item.lineId,
    productId: item.productId,
    specId: item.specId,

    // ── 呈現（欄位名配合 goods-card）──
    title: missing ? MISSING_TITLE : product.name,
    thumb: missing ? '' : product.thumb || '',
    desc: missing ? '' : product.category || '',
    price: item.addedPriceCents,
    quantity: item.quantity,
    specs: specNamesOf(product, item),
    // ⚠️ 商品不存在時給 0，讓 goods-card 走「此商品已無法購買」那個分支。
    //    給 null 會讓它的內建提示誤判為庫存不足。
    stockQuantity: missing ? 0 : (Number.isInteger(product.stock) ? product.stock : null),
    hideKey: { originPrice: true, num: true, tags: true },

    // ── 語意（頁面判斷用）──
    /** 顯示用價格＝加入時價格（§3.7.6 第 3 點：購物車是價格承諾） */
    priceCents: item.addedPriceCents,
    addedPriceCents: item.addedPriceCents,
    currentPriceCents,
    /** 現價的文字形式（WXML 沒有數字格式化能力，所以在這裡算好） */
    currentPriceText: currentPriceCents === null ? '' : formatCents(currentPriceCents),
    maxQuantity: maxQuantityOf(product),
    isSelected,
    isInvalid: false, // 由呼叫端決定（見 buildCartView）
    issueCode: code,
    issueText: code ? ISSUE_TEXT[code] || '' : '',
    /** 縮圖遮罩用的短文字（圓形塞不下長句） */
    issueShortText: code ? ISSUE_SHORT_TEXT[code] || '' : '',
    isPriceChanged: code === CartCode.PRICE_CHANGED,
  };
}

/**
 * 組出整頁的 view model。
 *
 * @param {object} args
 * @param {object} args.cart `utils/cart.js` 的購物車
 * @param {Record<string, object>} [args.catalog] productId → 商品（`fetchProducts()` 的列表建索引）
 * @param {string[]} [args.selectedLineIds] 目前勾選的明細
 * @returns {{ lines, invalidLines, priceChangeLines, totalCents, selectedCount,
 *             allSelected, hasPriceChange }}
 */
function buildCartView({ cart, catalog = {}, selectedLineIds = [] } = {}) {
  const raw = cart && Array.isArray(cart.items) ? cart : { items: [] };
  const selectedSet = new Set(selectedLineIds || []);

  // 規則一律來自 cart.validate()：問題碼的分類與優先順序不在此處重新定義
  const { issues } = cartRules.validate(raw, catalog);
  const issueOf = new Map(issues.map((issue) => [issue.lineId, issue]));

  const lines = [];
  const invalidLines = [];
  const priceChangeLines = [];

  for (const item of raw.items) {
    const issue = issueOf.get(item.lineId) || null;
    // 失效＝會阻擋結算的問題碼（BLOCKING_CODES 在 cartCodes.js 定義，此處不重寫）
    const isInvalid = !!issue && BLOCKING_CODES.includes(issue.code);
    // 失效項一律不勾選 —— 避免「勾了卻不能結算」的矛盾狀態
    const line = toLine(item, catalog[item.productId] || null, issue, isInvalid ? false : selectedSet.has(item.lineId));
    line.isInvalid = isInvalid;

    if (isInvalid) {
      invalidLines.push(line);
      continue;
    }
    lines.push(line);
    if (line.isPriceChanged && line.isSelected) priceChangeLines.push(line);
  }

  const selectedLines = lines.filter((l) => l.isSelected);

  return {
    lines,
    invalidLines,
    priceChangeLines,
    // 金額與件數一律走 cart.js 的同名函式（欄位名相同，可直接餵 view model）
    totalCents: cartRules.totalCents({ items: selectedLines }),
    selectedCount: cartRules.totalQuantity({ items: selectedLines }),
    allSelected: lines.length > 0 && selectedLines.length === lines.length,
    hasPriceChange: priceChangeLines.length > 0,
  };
}

/**
 * 依本輪的商品重整勾選狀態。
 *
 * 規則（`docs/P7a-2a-T4-計畫.md` §4.3）：
 * - **沒見過的明細預設勾選** —— 否則「加入商品 → 回購物車 → 按結算」會漏掉新商品
 * - **見過的保留原決定**（含明確的 `false`）—— 只改數量不該讓勾選跳掉
 * - 已移除的明細自動消失
 *
 * ⚠️ 用「明確的 false」而不是「不在清單裡」來表示取消勾選，
 *    否則使用者**刻意取消**的項目會在下一輪被當成「新項目」重新勾上。
 *
 * 首次進入時上一輪是空物件 → 全部預設勾選（＝全選），不需要額外的 firstLoad 旗標。
 *
 * @param {Record<string, boolean>} selectionByLineId
 * @param {Array} lines 本輪的有效明細
 * @returns {{ selectionByLineId: Record<string, boolean>, selectedLineIds: string[] }}
 */
function reconcileSelection(selectionByLineId, lines) {
  const prev = selectionByLineId || {};
  const next = {};
  for (const line of lines) {
    const decided = prev[line.lineId];
    next[line.lineId] = decided === undefined ? true : decided;
  }
  return {
    selectionByLineId: next,
    selectedLineIds: lines.filter((l) => next[l.lineId]).map((l) => l.lineId),
  };
}

/**
 * ⚠️ **相容橋接（T7 必須移除）**
 *
 * 舊結算頁（`pages/order/order-confirm/index.js`）讀的是
 * `wx.getStorageSync('order.goodsRequestList')` 後直接 `JSON.parse`。
 * 若 T4 只寫新格式，那裡會 `JSON.parse(undefined)` **拋錯 → 白屏**。
 *
 * 因此 T4 額外寫一份舊格式。欄位對應 `model/order/orderConfirm.js` 讀取的名字。
 *
 * @param {Array} lines 已勾選的 view model 明細
 */
function toLegacyGoodsRequest(lines) {
  return (lines || []).map((line) => ({
    storeId: LEGACY_STORE_ID,
    storeName: LEGACY_STORE_NAME,
    spuId: line.productId,
    skuId: line.specId || 'default',
    title: line.title,
    primaryImage: line.thumb,
    quantity: line.quantity,
    // 舊 mock 的價格是「分」的字串
    price: String(line.priceCents),
    specInfo: (line.specs || []).map((name) => ({ specValue: name })),
  }));
}

module.exports = {
  ISSUE_TEXT,
  ISSUE_SHORT_TEXT,
  LEGACY_STORE_ID,
  LEGACY_STORE_NAME,
  formatCents,
  buildCartView,
  reconcileSelection,
  toLegacyGoodsRequest,
};
