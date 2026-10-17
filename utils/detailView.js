/**
 * 詳情頁（**商品／服務**）的畫面組裝 —— **純函式**。
 *
 * ## 為什麼另開一支，不併進 `catalogView.js`
 *
 * `catalogView` 管「分類清單與卡片」（多筆、分組、排序）；本檔管「單一項目的詳情 ＋
 * 規格彈窗的 model」。兩者沒有共用邏輯，併在一起會讓 `catalogView` 變成雜物袋。
 *
 * ## 資料模型（T6a.3 起，依 `docs/01` §7.4）
 *
 * - 商品：`images[]`（第一張為主圖）、`specs`（**維度**）、`skus`（**組合**）
 * - 無規格：`specs: []`、`skus: []` → 讀商品層 `priceCents`／`stock`
 * - 有規格：價格與庫存**只看 SKU**；商品層 `priceCents` 只是展示起價、`stock` 不使用
 *
 * 服務沒有規格與庫存（產能＝可預約時段，派單時才確認，§3.7.4）。
 *
 * ## ⚠️ T6a.3 的兩個不變式
 *
 * 1. `sku.specValues` 的**順序必須與 `specs` 一致**（`findSkuBySelection` 依索引比對）
 * 2. 有規格的商品，數量上限＝**選中 SKU 的庫存**；未選完之前用「所有 SKU 的最大庫存」
 *    當上限（確保選得動），選完後由頁面即時收斂
 */

const { ItemType } = require('./catalogView.js');

/** 單筆購買數量的上限（與 cartCodes 的 MAX_LINE_QUANTITY 一致） */
const MAX_BUY_QUANTITY = 999;

/** 上架且未售完（服務沒有庫存概念，只看上架） */
function isAvailable(item, itemType) {
  if (!item || item.isActive === false) return false;
  if (itemType === ItemType.SERVICE) return true;
  const { specs, skus, stock } = normalizeSpecs(item);
  if (specs.length > 0) {
    // 有 SKU：可用性看有沒有任何 SKU 還有貨
    return skus.some((sku) => Number.isInteger(sku.stock) && sku.stock > 0);
  }
  return !(Number.isInteger(stock) && stock <= 0);
}

/** 防禦性讀取：缺欄位一律視為空 */
function normalizeSpecs(item) {
  return {
    specs: item && Array.isArray(item.specs) ? item.specs : [],
    skus: item && Array.isArray(item.skus) ? item.skus : [],
    stock: item && Number.isInteger(item.stock) ? item.stock : null,
  };
}

/** 主圖（images[0]；沒有 images 就是沒有圖） */
function primaryImageOf(item) {
  if (!item) return '';
  const images = Array.isArray(item.images) ? item.images : [];
  return images.length > 0 && images[0] ? images[0] : '';
}

/**
 * 商品／服務 → 詳情頁的 view model。
 *
 * ⚠️ `itemType` 必須由呼叫端明說：API 回傳的商品／服務**沒有**這個欄位
 *    （領域層兩者是分開的集合，§3.7.10）。
 *
 * @param {{ item: object, itemType: string }} args
 */
function buildDetailView({ item, itemType } = {}) {
  if (!item || !itemType) return null;

  const isService = itemType === ItemType.SERVICE;
  const { specs, skus, stock } = normalizeSpecs(item);
  const hasSpecs = !isService && specs.length > 0;
  const available = isAvailable(item, itemType);
  const images = Array.isArray(item.images) ? item.images.filter(Boolean) : [];

  // 數量上限：無規格看商品庫存；有規格看「所有 SKU 的最大庫存」（選完後頁面會收斂）
  let maxBuyQuantity = MAX_BUY_QUANTITY;
  if (!isService) {
    if (hasSpecs) {
      const maxSkuStock = skus.reduce((max, sku) => (Number.isInteger(sku.stock) ? Math.max(max, sku.stock) : max), 0);
      maxBuyQuantity = Math.min(maxSkuStock, MAX_BUY_QUANTITY);
    } else if (Number.isInteger(stock)) {
      maxBuyQuantity = Math.min(stock, MAX_BUY_QUANTITY);
    }
  }

  return {
    itemType,
    id: isService ? item.serviceId : item.productId,

    // ── 呈現 ──
    images,
    /** 主圖（規格彈窗的縮圖、分享預覽用） */
    thumb: images.length > 0 ? images[0] : '',
    title: item.name || '',
    /** 英文名（可選，§7.4 的 name_en） */
    titleEn: item.nameEn || '',
    description: item.description || '',
    /** 富文本內容（後台提供；由 P5／P8 清洗，見 §7.4.3） */
    detailHtml: item.detailHtml || '',
    priceCents: item.priceCents,

    // ── 狀態 ──
    isDelisted: item.isActive === false,
    isSoldOut: !isService && !available,

    // ── 商品才有 ──
    stock: isService ? null : stock,
    hasSpecs,
    /** ⚠️ 這裡是**維度數**（不是規格值的總數） */
    specCount: isService ? 0 : specs.length,
    maxBuyQuantity,

    // ── 服務才有 ──
    durationMinutes: isService && Number.isInteger(item.durationMinutes) ? item.durationMinutes : null,
    skillTags: isService && Array.isArray(item.skillTags) ? item.skillTags : [],

    // ── 底部按鈕的顯示決策 ──
    /** 服務永遠不進購物車（§3.7.2） */
    canAddToCart: !isService && available,
    /** ⚠️ 商品不得有「立即下單」（服務專屬）；立即購買是另一條路徑，見 P7a2a-C2 */
    canBuyNow: false,
    showBuyButtons: !isService && available,
  };
}

/**
 * 規格彈窗要的 model（`goods-specs-popup` 的 `specList` ＋ `skuList`）。
 *
 * T6a.3：**直接映射**（不再從扁平值「合成」）。
 * - `specList` ← `specs`（維度）
 * - `skuList`  ← `skus`（組合）；`quantity` 就是該 SKU 的庫存
 *
 * ⚠️ `specInfo` 的 `specId` 依 `specValues` 的**位置**對應 `specs` 的順序 ——
 *    這是模型的不變式（見檔頭）。
 *
 * @returns {{ specList: Array, skuList: Array }|null} 無規格時回 `null`
 */
function toSpecPopupModel({ item, itemType } = {}) {
  if (!item || itemType === ItemType.SERVICE) return null;
  const { specs, skus } = normalizeSpecs(item);
  if (specs.length === 0) return null;

  return {
    specList: specs.map((spec) => ({
      specId: spec.specId,
      title: spec.title || '規格',
      specValueList: (spec.values || []).map((value) => ({
        specValueId: value,
        specValue: value,
        isSelected: false,
        // 彈窗的 initData() 會自己依 skuList 算出庫存並覆寫，這裡先給佔位
        hasStockObj: { hasStock: false, specsArray: [] },
      })),
    })),
    skuList: skus.map((sku) => ({
      skuId: sku.skuId,
      quantity: Number.isInteger(sku.stock) ? Math.min(sku.stock, MAX_BUY_QUANTITY) : 0,
      specInfo: (sku.specValues || []).map((value, index) => ({
        specId: specs[index] ? specs[index].specId : `dim-${index}`,
        specValueId: value,
      })),
    })),
  };
}

/**
 * 依使用者在彈窗選的規格，找出對應的 SKU。
 *
 * @param {{ specs: Array, skus: Array, selectedSku: Record<string, string> }} args
 *        `selectedSku` 的形狀是彈窗回傳的 `{ [specId(維度)]: 值 }`
 * @returns {object|null} 找不到（尚未選完／組合不存在）時回 `null`
 */
function findSkuBySelection({ specs, skus, selectedSku } = {}) {
  if (!Array.isArray(specs) || specs.length === 0) return null;
  if (!Array.isArray(skus) || !selectedSku) return null;

  // 每個維度都必須有選值
  const wanted = specs.map((spec) => selectedSku[spec.specId]);
  if (wanted.some((value) => !value)) return null;

  return (
    skus.find(
      (sku) => Array.isArray(sku.specValues) && sku.specValues.length === wanted.length && sku.specValues.every((value, index) => value === wanted[index]),
    ) || null
  );
}

/** 取某個 SKU 的庫存（找不到或非整數 → `null`） */
function stockOfSku(skus, skuId) {
  if (!Array.isArray(skus) || !skuId) return null;
  const sku = skus.find((item) => item.skuId === skuId);
  return sku && Number.isInteger(sku.stock) ? sku.stock : null;
}

/**
 * ⚠️ **@deprecated（T6a.3）**：舊的「從扁平規格值取一個 id」。
 *
 * 新模型下購物車要存的是 **skuId**（`findSkuBySelection`），不是規格值。
 * 這裡暫時保留「取第一個已選維度的值」，讓 T6a.3-1 與 T6a.3-3 之間
 * 加入購物車仍可運作；**T6a.3-3 會移除本函式**。
 */
function selectedSpecIdOf(selectedSku) {
  if (!selectedSku) return null;
  const values = Object.keys(selectedSku)
    .map((key) => selectedSku[key])
    .filter(Boolean);
  return values.length === 1 ? values[0] : null;
}

module.exports = {
  MAX_BUY_QUANTITY,
  primaryImageOf,
  buildDetailView,
  toSpecPopupModel,
  findSkuBySelection,
  stockOfSku,
  selectedSpecIdOf,
};
