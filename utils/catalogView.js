/**
 * 目錄（分類 ＋ 服務／零件）的畫面組裝 —— **純函式**。
 *
 * ## 為什麼要有這一層
 *
 * 與 `utils/cartView.js` 同一個理由：頁面在 CI 裡跑不到，
 * 「分類樹怎麼組、混合清單怎麼排、卡片要餵什麼欄位」這些規則若寫在頁面裡就無人守。
 *
 * ## 這個檔案放的三件事
 *
 * | 函式 | 規則 |
 * |---|---|
 * | `buildCategoryTree()` | 兩層分類（`parentId === null` 為一級）＋ 上下架過濾 ＋ 同層 `order` 排序 |
 * | `mergeByCategory()` | **服務在上、零件在下**，各自按 `order` 排序（`docs/P7a-2a-T3.6-計畫.md` §9.1 的決策） |
 * | `toCardModel()` | 餵給既有呈現元件 `components/goods-card` 的欄位（與 T4 的 `cartView` 同一手法：**適配集中在一處**） |
 *
 * ## ⚠️ 領域分離不受影響
 *
 * `Service` 與 `Product` 在**領域層與儲存層都是分開的**（`docs/01` §3.7.10）。
 * 這裡只是把兩者**呈現**成同一個形狀 —— 正是 §3.7.1 說的
 * 「前端統一按 `CatalogItem` 呈現，後端按具體類型處理」。
 * `itemType` 欄位保留型別資訊，讓呼叫端（與後端）分得出這一筆是什麼。
 */

/** 服務／零件的型別標記 */
const ItemType = Object.freeze({
  SERVICE: 'service',
  PRODUCT: 'product',
});

/**
 * 「加購」這個動作對一筆項目該做什麼（T3.6.1）。
 *
 * 三種結果，規則各有依據：
 *
 * | 結果 | 條件 | 依據 |
 * |---|---|---|
 * | `ADD` | 零件、**沒有規格** | 可以直接寫入購物車，不需要再問什麼 |
 * | `CHOOSE_SPEC` | 零件、**有規格** | 直接加會漏掉規格（`prd-1` 有標準罐／大罐）→ 必須先選 |
 * | `SERVICE` | 服務 | §3.7.2：**服務永遠不進購物車**（`cart.addItem` 也會拒絕） |
 *
 * ⚠️ 這是**規則**，所以放在純函式裡並有測試 —— 畫面只負責照結果執行。
 *    `SERVICE` 這一條與 `utils/cart.js` 的 `SERVICE_NOT_CARTABLE` 是**雙重防護**：
 *    就算有人改壞了這裡，`addItem` 仍會拒絕。
 */
const AddAction = Object.freeze({
  ADD: 'add',
  CHOOSE_SPEC: 'choose-spec',
  SERVICE: 'service-not-cartable',
});

/**
 * 依項目決定加購行為。
 *
 * @param {{ itemType?: string, specCount?: number }} item 卡片 model 或原始項目
 * @returns {string|null} `AddAction` 的其中一個；`item` 為空時回 `null`
 */
function addActionFor(item) {
  if (!item) return null;
  if (item.itemType === ItemType.SERVICE) return AddAction.SERVICE;
  // 原始項目用 specs 陣列，卡片 model 用預先算好的 specCount
  const specCount = Number.isInteger(item.specCount)
    ? item.specCount
    : Array.isArray(item.specs)
      ? item.specs.length
      : 0;
  return specCount > 0 ? AddAction.CHOOSE_SPEC : AddAction.ADD;
}

/** 零件／服務在卡片上的標籤文字（混合清單裡讓使用者一眼分得出） */
const TYPE_LABEL = Object.freeze({
  [ItemType.SERVICE]: '服務',
  [ItemType.PRODUCT]: '零件',
});

/** 同層排序：沒有 `order` 的視為 0（維持穩定排序，不打亂資料順序） */
function byOrder(a, b) {
  return (a.order ?? 0) - (b.order ?? 0);
}

/** 上架中的分類（`isActive` 缺省視為上架） */
function isVisible(item) {
  return !!item && item.isActive !== false;
}

/**
 * 組成兩層分類樹（`pages/category/components/goods-category` 要的形狀）。
 *
 * ```js
 * [{ categoryId, name, children: [{ categoryId, name }, ...] }, ...]
 * ```
 *
 * **規則**：
 * - 只留上架的分類（`isActive !== false`）
 * - 一級 = `parentId` 為 null／undefined；其餘依 `parentId` 掛到對應的一級
 * - **孤兒二級直接丟掉**（`parentId` 指向不存在或已下架的一級）——
 *   否則畫面上會出現永遠看不到的分類
 * - 每個一級**一定有 `children` 陣列**（可以是空的）。
 *   ⚠️ 這不是美觀問題：`c-tabbar` 的 `tabList[activeKey]` 若為 `undefined`，
 *      它的 `setActive()` 會直接 `TypeError`（見該元件的實作）
 * - 同層依 `order` 排序
 *
 * @param {Array} categories `_fake/data.js` 的 `CATEGORIES`（扁平、帶 `parentId`）
 */
function buildCategoryTree(categories) {
  const visible = (categories || []).filter(isVisible);
  const level1 = visible.filter((c) => !c.parentId).sort(byOrder);

  return level1.map((parent) => ({
    categoryId: parent.categoryId,
    name: parent.name,
    children: visible
      .filter((c) => c.parentId === parent.categoryId)
      .sort(byOrder)
      .map((child) => ({ categoryId: child.categoryId, name: child.name })),
  }));
}

/**
 * 取某個**二級分類**下的目錄項目。
 *
 * 規則（`docs/P7a-2a-T3.6-計畫.md` §9.1）：
 * 1. 服務與零件都只取 `isActive !== false` 的
 * 2. **合併時服務在上、零件在下**（維修場景的核心是服務，零件是配角）
 * 3. 各自按 `order` 排序
 *
 * @param {{ services: Array, products: Array, categoryId: string }} args
 * @returns {Array} 每筆帶 `itemType`，並保留原始欄位
 */
function mergeByCategory({ services, products, categoryId } = {}) {
  if (!categoryId) return [];

  const ofCategory = (list, itemType) =>
    (list || [])
      .filter((item) => isVisible(item) && item.categoryId === categoryId)
      .sort(byOrder)
      .map((item) => ({ ...item, itemType }));

  return [
    ...ofCategory(services, ItemType.SERVICE),
    ...ofCategory(products, ItemType.PRODUCT),
  ];
}

/**
 * 把一筆服務／零件轉成 `components/goods-card` 吃得下的形狀。
 *
 * ⚠️ 這個元件（全域那一個）只渲染 `thumb`／`title`／`tags`／`price`／`originPrice`，
 *    因此這裡**只給它需要的欄位**；`originPrice` 刻意不給（電商欄位已下線）。
 *
 * @param {object} item `mergeByCategory()` 的產物（帶 `itemType`）
 */
function toCardModel(item) {
  if (!item) return null;
  const isService = item.itemType === ItemType.SERVICE;
  return {
    /** 型別＋id：呼叫端靠它決定點擊後去哪裡 */
    id: isService ? item.serviceId : item.productId,
    itemType: item.itemType,
    // ⚠️ T6a.3：主圖改讀 `images[0]`（資料模型的 `thumb` 已移除，§7.4）
    thumb: Array.isArray(item.images) && item.images.length > 0 ? item.images[0] || '' : '',
    title: item.name,
    /** 分（`price` 元件吃分） */
    price: item.priceCents,
    /** 混合清單裡的分類標籤 */
    tags: [TYPE_LABEL[item.itemType]],
    /**
     * 規格數量。
     *
     * ⚠️ 共用卡片元件**不渲染**這個欄位，它的用途是讓頁面判斷加購行為
     *    （`addActionFor()`）—— 卡片上加購圖示是無條件渲染的，頁面只能靠這個分流。
     */
    specCount: Array.isArray(item.specs) ? item.specs.length : 0,
  };
}

module.exports = {
  ItemType,
  TYPE_LABEL,
  AddAction,
  isVisible,
  buildCategoryTree,
  mergeByCategory,
  toCardModel,
  addActionFor,
};
