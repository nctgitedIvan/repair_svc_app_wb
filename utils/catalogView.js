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
 * | `mergeCatalog()` | T5：整份目錄合併，**零件在上、服務在下**（商品列表頁的預設順序） |
 * | `filterCatalogItems()` | T5：關鍵字／一級分類／價格區間的篩選 |
 * | `sortCatalogItems()` | T5：綜合（原順序）／價格升／價格降 |
 * | `paginateItems()` | T5：本機分頁（fake 資料一次抓完） |
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
 * 只留上架、依 `order` 排序，並標上 `itemType`。
 * （`mergeByCategory` 與 `mergeCatalog` 共用，避免兩套過濾規則）
 */
function typedVisibleList(list, itemType) {
  return (list || [])
    .filter(isVisible)
    .sort(byOrder)
    .map((item) => ({ ...item, itemType }));
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
    typedVisibleList(
      (list || []).filter((item) => item.categoryId === categoryId),
      itemType,
    );

  return [
    ...ofCategory(services, ItemType.SERVICE),
    ...ofCategory(products, ItemType.PRODUCT),
  ];
}

/**
 * 合併整份目錄（商品列表頁用）。
 *
 * ⚠️ T5：這一頁是「商品列表」、入口是購物車的「去逛逛零件」，
 *    因此**零件在上、服務在下**（與分類頁相反；分類頁的規則見 `mergeByCategory`）。
 *
 * @param {{ services: Array, products: Array }} args
 * @returns {Array} 每筆帶 `itemType`
 */
function mergeCatalog({ services, products } = {}) {
  return [
    ...typedVisibleList(products, ItemType.PRODUCT),
    ...typedVisibleList(services, ItemType.SERVICE),
  ];
}

/** 字串比對用：缺欄位一律視為空字串 */
function normalized(value) {
  return typeof value === 'string' ? value.toLowerCase() : '';
}

/**
 * 篩選目錄項目（商品列表頁用）。
 *
 * @param {Array} items `mergeCatalog()` 的產物
 * @param {{ keyword?: string, category?: string,
 *           minPriceCents?: number, maxPriceCents?: number }} criteria
 *        `category` 比對的是**一級分類名稱**（`item.category`）；
 *        價格區間為**含邊界**；`null`／`undefined` 代表不限制
 * @returns {Array} 新陣列（不改傳入的 items）
 */
function filterCatalogItems(items, { keyword, category, minPriceCents, maxPriceCents } = {}) {
  const list = Array.isArray(items) ? items : [];
  const needle = typeof keyword === 'string' ? keyword.trim().toLowerCase() : '';
  const hasMin = Number.isInteger(minPriceCents);
  const hasMax = Number.isInteger(maxPriceCents);

  return list.filter((item) => {
    if (!item) return false;

    if (category && item.category !== category) return false;

    if (needle) {
      // 名稱、英文名、描述都可搜尋（使用者可能輸入中文或英文）
      const haystack = [item.name, item.nameEn, item.description].map(normalized).join('\n');
      if (!haystack.includes(needle)) return false;
    }

    if (hasMin || hasMax) {
      // 沒有價格的項目無法判斷，直接排除（避免區間篩選時混進未知項）
      if (!Number.isInteger(item.priceCents)) return false;
      if (hasMin && item.priceCents < minPriceCents) return false;
      if (hasMax && item.priceCents > maxPriceCents) return false;
    }

    return true;
  });
}

/**
 * 排序目錄項目（商品列表頁用）。
 *
 * | `sorts` | 規則 |
 * |---|---|
 * | `''`（綜合） | 維持 `mergeCatalog()` 的順序 |
 * | `'asc'`／`'desc'` | 依 `priceCents`；**同價保持原順序**（穩定排序） |
 *
 * 沒有價格的項目一律排在最後（無論升冪或降冪），避免它們佔住第一頁。
 */
function sortCatalogItems(items, sorts) {
  const list = Array.isArray(items) ? items : [];
  if (sorts !== 'asc' && sorts !== 'desc') return list.slice();

  return list
    .map((item, index) => ({ item, index }))
    .sort((a, b) => {
      const priceA = a.item && Number.isInteger(a.item.priceCents) ? a.item.priceCents : null;
      const priceB = b.item && Number.isInteger(b.item.priceCents) ? b.item.priceCents : null;

      if (priceA === null && priceB === null) return a.index - b.index;
      if (priceA === null) return 1;
      if (priceB === null) return -1;

      const diff = sorts === 'asc' ? priceA - priceB : priceB - priceA;
      return diff !== 0 ? diff : a.index - b.index;
    })
    .map((entry) => entry.item);
}

/**
 * 本機分頁（商品列表頁用）。
 *
 * @returns {{ list: Array, total: number, page: number, pageSize: number, hasMore: boolean }}
 */
function paginateItems(items, { page = 1, pageSize = 10 } = {}) {
  const list = Array.isArray(items) ? items : [];
  const total = list.length;
  const size = Number.isInteger(pageSize) && pageSize > 0 ? pageSize : 10;
  const safePage = Number.isInteger(page) && page > 0 ? page : 1;
  const start = (safePage - 1) * size;
  const pageList = start >= total ? [] : list.slice(start, start + size);

  return {
    list: pageList,
    total,
    page: safePage,
    pageSize: size,
    hasMore: start + pageList.length < total,
  };
}

/**
 * 商品是否售完（T5）。
 *
 * | 情況 | 判斷 |
 * |---|---|
 * | 服務 | 永遠不是「售完」（沒有庫存概念） |
 * | 有 SKU 的商品 | 所有 SKU 的 `stock` 都 ≤ 0 才算售完 |
 * | 無規格商品 | 商品層 `stock` ≤ 0 |
 *
 * ⚠️ 與 `utils/detailView.isAvailable()` 是同一條規則的兩個面向：
 *    這裡回答「卡片要不要標售完」，那裡回答「詳情頁能不能加購」。
 */
function isSoldOutItem(item) {
  if (!item || item.itemType === ItemType.SERVICE) return false;

  const skus = Array.isArray(item.skus) ? item.skus : [];
  if (skus.length > 0) {
    return !skus.some((sku) => Number.isInteger(sku.stock) && sku.stock > 0);
  }
  return Number.isInteger(item.stock) && item.stock <= 0;
}

/**
 * 把一筆服務／零件轉成 `components/goods-card` 吃得下的形狀。
 *
 * ⚠️ 這個元件（全域那一個）只渲染 `thumb`／`title`／`tags`／`price`／`originPrice`，
 *    因此這裡**只給它需要的欄位**；`originPrice` 刻意不給（電商欄位已下線）。
 *
 * @param {object} item `mergeByCategory()`／`mergeCatalog()` 的產物（帶 `itemType`）
 */
function toCardModel(item) {
  if (!item) return null;
  const isService = item.itemType === ItemType.SERVICE;
  const soldOut = isSoldOutItem(item);

  return {
    /** 型別＋id：呼叫端靠它決定點擊後去哪裡 */
    id: isService ? item.serviceId : item.productId,
    itemType: item.itemType,
    // ⚠️ T6a.3：主圖改讀 `images[0]`（資料模型的 `thumb` 已移除，§7.4）
    thumb: Array.isArray(item.images) && item.images.length > 0 ? item.images[0] || '' : '',
    title: item.name,
    /** 分（`price` 元件吃分） */
    price: item.priceCents,
    /** 混合清單裡的分類標籤；售完再補一個（T5） */
    tags: [TYPE_LABEL[item.itemType], ...(soldOut ? ['已售完'] : [])],
    /** 頁面據此擋下「售完還加購」；卡片元件不渲染這個欄位 */
    isSoldOut: soldOut,
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
  mergeCatalog,
  filterCatalogItems,
  sortCatalogItems,
  paginateItems,
  isSoldOutItem,
  toCardModel,
  addActionFor,
};
