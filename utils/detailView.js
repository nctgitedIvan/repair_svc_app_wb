/**
 * 詳情頁（**商品／服務**）的畫面組裝 —— **純函式**。
 *
 * ## 為什麼另開一支，不併進 `catalogView.js`
 *
 * `catalogView` 管的是「分類清單與卡片」（多筆、要分組、要排序）；
 * 本檔管的是「單一項目的詳情 ＋ 規格彈窗的 model」。兩者沒有共用邏輯，
 * 併在一起會讓 `catalogView` 變成什麼都塞的雜物袋。
 *
 * ## 商品與服務共用同一個詳情頁
 *
 * 依 2026-10-17 的決策（`docs/P7a-2a-T6a-計畫.md` §11 Q-1）：
 * 兩者用**同一個頁面骨架**，差異由本檔的 view model 表達，頁面只負責渲染。
 *
 * | 面向 | 商品 | 服務 |
 * |---|---|---|
 * | 規格 | 有 → 加購要開彈窗 | **無** |
 * | 庫存 | 有 → 售完要擋 | **無**（產能＝可預約時段，派單時才確認） |
 * | 時長／技能標籤 | ❌ | ✅ 要顯示 |
 * | 加入購物車 | ✅ | ❌ **永遠不進購物車**（§3.7.2） |
 * | 立即下單 | ❌ **不得有**（P7a2a-C2） | ✅ 但屬 P7a-2b（依賴 T7） |
 *
 * ## ⚠️ 為什麼要「合成」規格彈窗的形狀
 *
 * 既有的 `goods-specs-popup` 要的是**多維度**的形狀
 * （`specList: [{ specId, title, specValueList }]` ＋ `skuList: [{ specInfo }]`），
 * 而本專案的資料模型只有**一層規格值**（`product.specs: [{ specId, name }]`）。
 * 因此 `toSpecPopupModel()` 把它合成單一維度的形狀 ——
 * 彈窗內部的庫存交集演算法在單維度下仍然正確，只是結果單純。
 */

const { ItemType } = require('./catalogView.js');

/** 合成出來的規格維度 id（本專案只有一層，故固定） */
const SPEC_DIMENSION_ID = 'spec';

/** 合成出來的規格維度標題（新模型沒有維度名稱） */
const SPEC_DIMENSION_TITLE = '規格';

/** 單筆購買數量的上限（與 cartCodes 的 MAX_LINE_QUANTITY 一致） */
const MAX_BUY_QUANTITY = 999;

/** 上架且未售完（服務沒有庫存概念，只看上架） */
function isAvailable(item, itemType) {
  if (!item || item.isActive === false) return false;
  if (itemType === ItemType.SERVICE) return true;
  return !(Number.isInteger(item.stock) && item.stock <= 0);
}

/**
 * 商品／服務 → 詳情頁的 view model。
 *
 * ⚠️ `itemType` 必須由呼叫端明說：API 回傳的商品／服務**沒有** `itemType` 欄位
 *    （領域層兩者是分開的集合，見 `docs/01` §3.7.10）。
 *
 * @param {{ item: object, itemType: string }} args
 */
function buildDetailView({ item, itemType } = {}) {
  if (!item || !itemType) return null;

  const isService = itemType === ItemType.SERVICE;
  const stock = isService || !Number.isInteger(item.stock) ? null : item.stock;
  const specs = Array.isArray(item.specs) ? item.specs : [];
  const available = isAvailable(item, itemType);
  const thumb = item.thumb || '';

  return {
    itemType,
    id: isService ? item.serviceId : item.productId,

    // ── 呈現 ──
    /** 目前資料模型只有單圖；多圖詳情是 P2 的新欄位（T6a §11 Q-5） */
    images: thumb ? [thumb] : [],
    thumb,
    title: item.name || '',
    description: item.description || '',
    priceCents: item.priceCents,

    // ── 狀態 ──
    isDelisted: item.isActive === false,
    /** 商品且庫存為 0（服務恆 false —— 它沒有庫存） */
    isSoldOut: !isService && stock === 0,

    // ── 商品才有 ──
    stock,
    hasSpecs: !isService && specs.length > 0,
    specCount: isService ? 0 : specs.length,
    /** 購買數量的上限：有庫存就用庫存 */
    maxBuyQuantity: !isService && Number.isInteger(stock) ? Math.min(stock, MAX_BUY_QUANTITY) : MAX_BUY_QUANTITY,

    // ── 服務才有 ──
    durationMinutes: isService && Number.isInteger(item.durationMinutes) ? item.durationMinutes : null,
    skillTags: isService && Array.isArray(item.skillTags) ? item.skillTags : [],

    // ── 底部按鈕的顯示決策 ──
    /** 服務永遠不進購物車；商品要上架且有庫存 */
    canAddToCart: !isService && available,
    /**
     * ⚠️ 商品**永遠不得有「立即下單」**（人工驗收 P7a2a-C2）。
     *    服務的「立即預約」屬 P7a-2b（依賴 T7 的結算頁），因此這裡也先關掉。
     */
    canBuyNow: false,
    /** 右下角要不要顯示按鈕（服務留空） */
    showBuyButtons: !isService && available,
  };
}

/**
 * 規格彈窗要的 model（`goods-specs-popup` 的 `specList` ＋ `skuList`）。
 *
 * @returns {{ specList: Array, skuList: Array }|null} 無規格時回 `null`
 *          —— **呼叫端據此決定「直接加入」或「開彈窗」**，不要自己判斷。
 */
function toSpecPopupModel({ item, itemType } = {}) {
  if (!item || itemType === ItemType.SERVICE) return null;
  const specs = Array.isArray(item.specs) ? item.specs : [];
  if (specs.length === 0) return null;

  const stock = Number.isInteger(item.stock) ? item.stock : 0;

  return {
    // 單一維度：把每個規格值當成同一維度的選項
    specList: [
      {
        specId: SPEC_DIMENSION_ID,
        title: SPEC_DIMENSION_TITLE,
        specValueList: specs.map((spec) => ({
          specValueId: spec.specId,
          specValue: spec.name,
          isSelected: false,
          // 彈窗的 initData() 會自己算出來並覆寫，這裡不必先算
          hasStockObj: { hasStock: false, specsArray: [] },
        })),
      },
    ],
    // 每個規格值一個 SKU，庫存用商品總庫存（本專案沒有逐 SKU 庫存）
    skuList: specs.map((spec) => ({
      skuId: spec.specId,
      quantity: Math.min(stock, MAX_BUY_QUANTITY),
      specInfo: [{ specId: SPEC_DIMENSION_ID, specValueId: spec.specId }],
    })),
  };
}

/**
 * 從彈窗回傳的 `selectedSku` 取出「選中的規格值」。
 *
 * 彈窗的 `selectedSku` 形狀是 `{ [維度id]: 值id }`；本專案只有一個維度，
 * 所以在這裡收斂成單一值，**頁面不需要知道彈窗的內部形狀**。
 *
 * @returns {string|null} 尚未選完整時回 `null`
 */
function selectedSpecIdOf(selectedSku) {
  if (!selectedSku) return null;
  const value = selectedSku[SPEC_DIMENSION_ID];
  return value ? value : null;
}

module.exports = {
  SPEC_DIMENSION_ID,
  SPEC_DIMENSION_TITLE,
  MAX_BUY_QUANTITY,
  buildDetailView,
  toSpecPopupModel,
  selectedSpecIdOf,
};
