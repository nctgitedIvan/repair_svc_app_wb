/**
 * 購物車（純函式 + 本機持久化）。
 *
 * ## ⚠️ 目前存在前端，P7b 會改為後端
 *
 * Q-D 決策：P7a-2a 用本機 Storage，P7b 改後端 ——
 * **但 schema 必須與後端一致**，讓遷移時只需換掉讀寫來源，不用改邏輯。
 *
 * 因此這裡的購物車形狀刻意設計成「伺服器會存的樣子」：
 *
 * ```js
 * {
 *   items: [{
 *     lineId,               // 明細識別碼（後端會產生，本機用 productId:specId）
 *     productId, specId,
 *     quantity,
 *     addedPriceCents,      // ⚠️ 加入當時的價格（§3.7.6 第 3 點）
 *     currency,
 *     addedAt,
 *   }],
 *   updatedAt,
 * }
 * ```
 *
 * ## 設計原則
 *
 * - **所有函式都是純函式**：接收 cart、回傳新 cart，不修改傳入物件
 * - 儲存與讀取由 `loadCart` / `saveCart` 負責（有副作用，與純邏輯分開）
 * - **服務永遠不得進購物車** —— 在 `addItem` 就擋下（型別層面固定規則）
 */

const { CartCode, MAX_CART_LINES, MAX_LINE_QUANTITY, BLOCKING_CODES } = require('./cartCodes');

const STORAGE_KEY = 'repair.cart.v1';

/** 建立空購物車 */
function createCart() {
  return { items: [], updatedAt: null };
}

/** 統一的結果形狀 */
function ok(cart, extra = {}) {
  return { ok: true, cart, ...extra };
}
function fail(code, cart = null, extra = {}) {
  return { ok: false, code, cart, ...extra };
}

/** 明細識別碼：同一商品的不同規格是不同明細 */
function lineIdOf(productId, specId) {
  return specId ? `${productId}:${specId}` : productId;
}

/**
 * 加入商品。
 *
 * ⚠️ **服務一律拒絕** —— §3.7.2：服務永遠走「立即下單」，不進購物車。
 *    這條規則寫在這裡（而不是靠呼叫端記得），是刻意的。
 *
 * @param {object} cart
 * @param {{ itemType: string, productId: string, specId?: string, quantity: number,
 *           priceCents: number, currency?: string }} item
 * @param {number} now Unix 毫秒（由呼叫方傳入，保持純函式）
 */
function addItem(cart, item, now) {
  if (!cart || !Array.isArray(cart.items)) return fail(CartCode.LINE_NOT_FOUND);

  if (!item || item.itemType !== 'product') {
    return fail(CartCode.SERVICE_NOT_CARTABLE, cart);
  }
  if (!item.productId) return fail(CartCode.PRODUCT_NOT_FOUND, cart);
  if (!Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > MAX_LINE_QUANTITY) {
    return fail(CartCode.INVALID_QUANTITY, cart);
  }

  const lineId = lineIdOf(item.productId, item.specId);
  const existingIndex = cart.items.findIndex((l) => l.lineId === lineId);

  if (existingIndex === -1 && cart.items.length >= MAX_CART_LINES) {
    return fail(CartCode.LIMIT_EXCEEDED, cart, { limit: MAX_CART_LINES });
  }

  const items = cart.items.map((l) => ({ ...l }));

  if (existingIndex >= 0) {
    const merged = items[existingIndex].quantity + item.quantity;
    if (merged > MAX_LINE_QUANTITY) return fail(CartCode.INVALID_QUANTITY, cart);
    items[existingIndex].quantity = merged;
    // ⚠️ 合併時**不更新 addedPriceCents** —— 保留最初加入時的價格
  } else {
    items.push({
      lineId,
      productId: item.productId,
      specId: item.specId || null,
      quantity: item.quantity,
      addedPriceCents: item.priceCents,
      currency: item.currency || 'CNY',
      addedAt: now,
    });
  }

  return ok({ items, updatedAt: now });
}

/** 修改數量（quantity = 0 等同移除） */
function updateQuantity(cart, lineId, quantity, now) {
  if (!cart || !Array.isArray(cart.items)) return fail(CartCode.LINE_NOT_FOUND);
  const index = cart.items.findIndex((l) => l.lineId === lineId);
  if (index === -1) return fail(CartCode.LINE_NOT_FOUND, cart);

  if (!Number.isInteger(quantity) || quantity < 0 || quantity > MAX_LINE_QUANTITY) {
    return fail(CartCode.INVALID_QUANTITY, cart);
  }
  if (quantity === 0) return removeLine(cart, lineId, now);

  const items = cart.items.map((l, i) => (i === index ? { ...l, quantity } : { ...l }));
  return ok({ items, updatedAt: now });
}

/** 移除明細 */
function removeLine(cart, lineId, now) {
  if (!cart || !Array.isArray(cart.items)) return fail(CartCode.LINE_NOT_FOUND);
  const items = cart.items.filter((l) => l.lineId !== lineId);
  if (items.length === cart.items.length) return fail(CartCode.LINE_NOT_FOUND, cart);
  return ok({ items, updatedAt: now });
}

/** 清空 */
function clear(now) {
  return { items: [], updatedAt: now };
}

/** 依「加入時價格」計算總額（§3.7.6 第 3 點） */
function totalCents(cart) {
  if (!cart || !Array.isArray(cart.items)) return 0;
  return cart.items.reduce((sum, l) => sum + l.addedPriceCents * l.quantity, 0);
}

/** 總件數 */
function totalQuantity(cart) {
  if (!cart || !Array.isArray(cart.items)) return 0;
  return cart.items.reduce((sum, l) => sum + l.quantity, 0);
}

function isEmpty(cart) {
  return !cart || !Array.isArray(cart.items) || cart.items.length === 0;
}

/**
 * 結算前檢查（§3.7.6 的四種邊界情況）。
 *
 * ⚠️ **為什麼在結算時才檢查，而不是加入時**：
 *    加入時檢查會讓「加入後才被搶光」的商品**靜默留在購物車**，
 *    使用者在結算時才發現 —— 那更糟。
 *    結算時統一檢查並標紅，一次講清楚。
 *
 * @param {object} cart
 * @param {Record<string, {isActive: boolean, stock: number, priceCents: number}>} catalog
 *        以 `productId`（或 `lineId`）索引的商品現況
 * @returns {{ ok: boolean, issues: Array<{lineId, code, detail?}>, blocking: Array }}
 */
function validate(cart, catalog) {
  const issues = [];
  if (isEmpty(cart)) return { ok: true, issues, blocking: [] };

  for (const line of cart.items) {
    const current = catalog[line.productId];

    if (!current) {
      issues.push({ lineId: line.lineId, code: CartCode.PRODUCT_NOT_FOUND });
      continue;
    }
    if (current.isActive === false) {
      issues.push({ lineId: line.lineId, code: CartCode.DELISTED });
      continue;
    }
    if (Number.isInteger(current.stock) && current.stock < line.quantity) {
      issues.push({
        lineId: line.lineId,
        code: CartCode.OUT_OF_STOCK,
        detail: { requested: line.quantity, stock: current.stock },
      });
      continue;
    }
    if (Number.isInteger(current.priceCents) && current.priceCents !== line.addedPriceCents) {
      issues.push({
        lineId: line.lineId,
        code: CartCode.PRICE_CHANGED,
        // 價格變動**不阻擋結算** —— 提示使用者後由他決定（§3.7.6 第 3 點）
        detail: { addedPriceCents: line.addedPriceCents, currentPriceCents: current.priceCents },
      });
    }
  }

  const blocking = issues.filter((i) => BLOCKING_CODES.includes(i.code));
  return { ok: blocking.length === 0, issues, blocking };
}

/** 結算用的 payload（形狀對齊後端的 checkout 請求） */
function toCheckoutPayload(cart, { addressId, appointmentAt } = {}) {
  return {
    source: 'cart',
    items: (cart.items || []).map((l) => ({
      itemType: 'product',
      productId: l.productId,
      specId: l.specId,
      quantity: l.quantity,
      // 帶上加入時價格，讓後端可比對並回報差異
      expectedPriceCents: l.addedPriceCents,
    })),
    addressId,
    appointmentAt,
  };
}

// ── 持久化（有副作用，與純邏輯分開）──

/**
 * 判斷一筆明細是否**存得起來**（壞掉的就丟掉，見 `normalizeCart`）。
 */
function isStorableItem(item) {
  return (
    !!item &&
    typeof item.lineId === 'string' &&
    item.lineId.length > 0 &&
    typeof item.productId === 'string' &&
    item.productId.length > 0 &&
    Number.isInteger(item.quantity) &&
    item.quantity >= 1 &&
    Number.isInteger(item.addedPriceCents) &&
    item.addedPriceCents >= 0
  );
}

/**
 * 把 Storage 讀到的內容**正規化**成購物車。**純函式，可單獨測試。**
 *
 * 為什麼要抽出來：`loadCart()` 會碰 `wx`（Node 測試跑不了），
 * 但「資料壞掉時怎麼辦」才是真正容易出錯的地方。抽出來後這段就有覆蓋。
 *
 * 處理原則：**單筆壞掉不該毀掉整車。**
 *
 * | 情況 | 處理 |
 * |---|---|
 * | 整包無法解析（`JSON.parse` 失敗） | 空車 |
 * | 不是 `{ items: [...] }` 的形狀 | 空車 |
 * | 個別明細缺欄位／型別不對／數量 < 1 | **只丟掉那一筆** |
 * | 數量超過 `MAX_LINE_QUANTITY` | 夾到上限（不丟掉 —— 那是使用者的東西） |
 * | 重複的 `lineId` | 只留第一筆（否則 `updateQuantity` 改第一筆、`removeLine` 刪全部，行為不一致） |
 *
 * @param {string|object} raw `wx.getStorageSync` 的原始回傳值
 */
function normalizeCart(raw) {
  let parsed = raw;
  if (typeof raw === 'string') {
    try {
      parsed = JSON.parse(raw);
    } catch (err) {
      return createCart();
    }
  }
  if (!parsed || !Array.isArray(parsed.items)) return createCart();

  const seen = new Set();
  const items = [];
  for (const item of parsed.items) {
    if (!isStorableItem(item) || seen.has(item.lineId)) continue;
    seen.add(item.lineId);
    items.push({
      lineId: item.lineId,
      productId: item.productId,
      specId: item.specId || null,
      quantity: Math.min(item.quantity, MAX_LINE_QUANTITY),
      addedPriceCents: item.addedPriceCents,
      currency: item.currency || 'CNY',
      addedAt: Number.isInteger(item.addedAt) ? item.addedAt : null,
    });
  }

  return { items, updatedAt: Number.isInteger(parsed.updatedAt) ? parsed.updatedAt : null };
}

function loadCart() {
  try {
    return normalizeCart(wx.getStorageSync(STORAGE_KEY));
  } catch (err) {
    // 讀取失敗不該讓整個購物車頁崩潰
    console.warn('[cart] 讀取本機購物車失敗，改用空車', err);
    return createCart();
  }
}

function saveCart(cart) {
  try {
    wx.setStorageSync(STORAGE_KEY, JSON.stringify(cart));
    return true;
  } catch (err) {
    console.warn('[cart] 儲存本機購物車失敗', err);
    return false;
  }
}

module.exports = {
  STORAGE_KEY,
  createCart,
  lineIdOf,
  addItem,
  updateQuantity,
  removeLine,
  clear,
  totalCents,
  totalQuantity,
  isEmpty,
  validate,
  toCheckoutPayload,
  normalizeCart,
  loadCart,
  saveCart,
};
