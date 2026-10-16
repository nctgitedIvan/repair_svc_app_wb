/**
 * 購物車的問題碼與規則常數。
 *
 * 與 `utils/cart.js` 相同，刻意用 CommonJS 以便單元測試。
 *
 * ⚠️ 這些碼必須與後端（P7b／P8）**保持一致** ——
 *    前端顯示與後端拒絕要用同一套語意，否則會出現
 *    「前端說可以、後端說不行」而使用者看到兩種訊息。
 */

const CartCode = Object.freeze({
  // ── 加入時 ──
  /** 服務不得進購物車（§3.7.2 的核心規則） */
  SERVICE_NOT_CARTABLE: 'SERVICE_NOT_CARTABLE',
  /** 超過購物車項數上限 */
  LIMIT_EXCEEDED: 'LIMIT_EXCEEDED',
  /** 數量非正整數 */
  INVALID_QUANTITY: 'INVALID_QUANTITY',
  /** 找不到該商品 */
  PRODUCT_NOT_FOUND: 'PRODUCT_NOT_FOUND',

  // ── 結算前檢查（§3.7.6）──
  /** 庫存不足（被搶光） */
  OUT_OF_STOCK: 'OUT_OF_STOCK',
  /** 商品已下架 */
  DELISTED: 'DELISTED',
  /** 價格已變動 */
  PRICE_CHANGED: 'PRICE_CHANGED',
  /** 找不到該明細 */
  LINE_NOT_FOUND: 'LINE_NOT_FOUND',
});

/** 購物車項數上限（§3.7.6 第 4 點） */
const MAX_CART_LINES = 50;

/** 單一明細的數量上限（避免誤操作造成天文數字） */
const MAX_LINE_QUANTITY = 999;

/** 這些問題碼會阻擋結算 */
const BLOCKING_CODES = Object.freeze([
  CartCode.OUT_OF_STOCK,
  CartCode.DELISTED,
  CartCode.PRODUCT_NOT_FOUND,
]);

module.exports = { CartCode, MAX_CART_LINES, MAX_LINE_QUANTITY, BLOCKING_CODES };
