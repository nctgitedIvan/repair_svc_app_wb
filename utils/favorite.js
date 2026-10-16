/**
 * 客戶收藏（純函式 ＋ 本機持久化）。
 *
 * ## ⚠️ 這是 P7a 的臨時方案，P5 必須改
 *
 * 正式的收藏要寫進**資料庫集合** `favorites`（`docs/01` §7.1／§7.2 第 9 點），
 * 而集合是 **P2** 才建 —— P7a 階段沒有資料庫、沒有雲函數。
 *
 * 因此現在寫在**本機 Storage**，但 **schema 對齊後端**，
 * P7b 只需換掉讀寫來源（與購物車 `utils/cart.js` 完全相同的策略）。
 *
 * ## ⚠️ `customerId` 不得由前端決定
 *
 * 後端用 `cloud.getWXContext().OPENID` 查 `users` 決定擁有者
 * （`docs/01` §4.8.1）—— 前端若能自己傳，就可以冒充別人。
 *
 * P7a 讀不到真實 openid，所以用**佔位符**寫進本機資料，
 * **讓形狀與後端一致**；P5 接上後端時這個欄位由後端填。
 *
 * ## 形狀（對應 `docs/01` §7.2 第 9 點）
 *
 * ```js
 * {
 *   customerId,                                    // ← P7a 為佔位符
 *   productId,
 *   productSnapshot: { name, image, priceCents },  // ← 收藏當下的快照
 *   createdAt,                                     // Unix ms
 * }
 * ```
 *
 * ⚠️ **本機用 camelCase（前端慣例），後端是 snake_case**
 *    （`product_snapshot.price_cents`）—— 由 P7b 的 adapter 轉換，
 *    與購物車的作法一致。
 *
 * ## 快照的語意
 *
 * `productSnapshot` 是**收藏當下**的值，與購物車的 `addedPriceCents` 同一設計
 * （`docs/01` §3.7.6 第 3 點）：後台改價／改名**不影響已收藏的紀錄**。
 * 清單要顯示「¥80（已漲至 ¥100）」時，拿快照與商品現況比對 —— 那是 T6b 的事。
 */

const STORAGE_KEY = 'repair.favorites.v1';

/**
 * ⚠️ **P7a 的 openid 佔位符。**
 *
 * 本機讀不到真實 openid（那是後端用 `getWXContext()` 拿的）。
 * P5 接上後端後，這個值由後端決定，前端**不得**再自行填寫。
 */
const LOCAL_CUSTOMER_ID = '__local__';

/** 收藏清單的上限（避免本機資料無限成長；後端版不需要這個限制） */
const MAX_FAVORITES = 200;

/** 建立空的收藏資料 */
function createStore() {
  return { items: [], updatedAt: null };
}

function ok(store, extra = {}) {
  return { ok: true, store, ...extra };
}
function fail(code, store = null) {
  return { ok: false, code, store };
}

/** 錯誤碼 */
const FavoriteCode = Object.freeze({
  /** 找不到該商品（要取消收藏但它不在清單裡） */
  NOT_FOUND: 'NOT_FOUND',
  /** 缺少必要欄位 */
  INVALID: 'INVALID',
  /** 已達收藏上限 */
  LIMIT_EXCEEDED: 'LIMIT_EXCEEDED',
});

/** 把商品轉成快照（只留顯示需要的三個欄位） */
function toSnapshot(item) {
  if (!item) return null;
  return {
    name: item.name || '',
    image: item.thumb || '',
    priceCents: Number.isInteger(item.priceCents) ? item.priceCents : 0,
  };
}

/** 是否已收藏 */
function isFavorite(store, productId) {
  if (!store || !Array.isArray(store.items) || !productId) return false;
  return store.items.some((entry) => entry.productId === productId);
}

/**
 * 收藏清單。
 *
 * ⚠️ **必須連 `productSnapshot` 一起複製**（不是只複製外層）——
 * 淺拷貝的話呼叫端改 `list[0].productSnapshot.priceCents` 會直接改到內部資料。
 * （這個 bug 是 `favorite.test.js` 的「改回傳值不影響原 store」抓出來的。）
 */
function listFavorites(store) {
  if (!store || !Array.isArray(store.items)) return [];
  return store.items.map((entry) => ({
    ...entry,
    productSnapshot: { ...entry.productSnapshot },
  }));
}

/** 加入收藏 */
function addFavorite(store, { productId, item, now } = {}) {
  const base = store && Array.isArray(store.items) ? store : createStore();
  if (!productId) return fail(FavoriteCode.INVALID, base);
  // 已收藏就維持原狀（**不更新快照** —— 快照是「第一次收藏當下」的值）
  if (isFavorite(base, productId)) return ok(base, { added: false });

  const snapshot = toSnapshot(item);
  if (!snapshot) return fail(FavoriteCode.INVALID, base);
  if (base.items.length >= MAX_FAVORITES) return fail(FavoriteCode.LIMIT_EXCEEDED, base);

  return ok(
    {
      items: [
        ...base.items.map((entry) => ({ ...entry })),
        { customerId: LOCAL_CUSTOMER_ID, productId, productSnapshot: snapshot, createdAt: now },
      ],
      updatedAt: now,
    },
    { added: true },
  );
}

/** 移除收藏 */
function removeFavorite(store, productId, now) {
  const base = store && Array.isArray(store.items) ? store : createStore();
  const items = base.items.filter((entry) => entry.productId !== productId);
  if (items.length === base.items.length) return fail(FavoriteCode.NOT_FOUND, base);
  return ok({ items, updatedAt: now }, { removed: true });
}

/**
 * 切換收藏（詳情頁的按鈕用這支）。
 *
 * @returns {{ ok: boolean, store: object, favorited: boolean, code?: string }}
 */
function toggleFavorite(store, { productId, item, now } = {}) {
  const base = store && Array.isArray(store.items) ? store : createStore();
  if (isFavorite(base, productId)) {
    const result = removeFavorite(base, productId, now);
    return { ...result, favorited: false };
  }
  const result = addFavorite(base, { productId, item, now });
  return { ...result, favorited: result.ok };
}

// ── 持久化（有副作用，與純邏輯分開）──

/** 一筆收藏是否存得起來（壞掉的就丟掉，見 `normalizeStore`） */
function isStorableEntry(entry) {
  return (
    !!entry &&
    typeof entry.productId === 'string' &&
    entry.productId.length > 0 &&
    !!entry.productSnapshot &&
    typeof entry.productSnapshot.name === 'string' &&
    Number.isInteger(entry.productSnapshot.priceCents)
  );
}

/**
 * 把 Storage 讀到的內容正規化成收藏資料。**純函式，可單獨測試。**
 *
 * 與 `cart.normalizeCart()` 同一套原則：**單筆壞掉不該毀掉整份**。
 *
 * | 情況 | 處理 |
 * |---|---|
 * | 無法解析／形狀不對 | 空資料 |
 * | 個別紀錄缺欄位 | **只丟那一筆** |
 * | 重複的 `productId` | 只留第一筆（與後端的唯一索引語意一致） |
 * | 缺 `customerId` | 補上佔位符（P5 由後端填） |
 */
function normalizeStore(raw) {
  let parsed = raw;
  if (typeof raw === 'string') {
    try {
      parsed = JSON.parse(raw);
    } catch (err) {
      return createStore();
    }
  }
  if (!parsed || !Array.isArray(parsed.items)) return createStore();

  const seen = new Set();
  const items = [];
  for (const entry of parsed.items) {
    if (!isStorableEntry(entry) || seen.has(entry.productId)) continue;
    if (items.length >= MAX_FAVORITES) break;
    seen.add(entry.productId);
    items.push({
      customerId: typeof entry.customerId === 'string' && entry.customerId ? entry.customerId : LOCAL_CUSTOMER_ID,
      productId: entry.productId,
      productSnapshot: {
        name: entry.productSnapshot.name,
        image: typeof entry.productSnapshot.image === 'string' ? entry.productSnapshot.image : '',
        priceCents: entry.productSnapshot.priceCents,
      },
      createdAt: Number.isInteger(entry.createdAt) ? entry.createdAt : null,
    });
  }

  return { items, updatedAt: Number.isInteger(parsed.updatedAt) ? parsed.updatedAt : null };
}

function loadFavorites() {
  try {
    return normalizeStore(wx.getStorageSync(STORAGE_KEY));
  } catch (err) {
    // 讀取失敗不該讓詳情頁崩潰（收藏只是附加功能）
    console.warn('[favorite] 讀取本機收藏失敗，改用空資料', err);
    return createStore();
  }
}

function saveFavorites(store) {
  try {
    wx.setStorageSync(STORAGE_KEY, JSON.stringify(store));
    return true;
  } catch (err) {
    console.warn('[favorite] 儲存本機收藏失敗', err);
    return false;
  }
}

module.exports = {
  STORAGE_KEY,
  LOCAL_CUSTOMER_ID,
  MAX_FAVORITES,
  FavoriteCode,
  createStore,
  toSnapshot,
  isFavorite,
  listFavorites,
  addFavorite,
  removeFavorite,
  toggleFavorite,
  normalizeStore,
  loadFavorites,
  saveFavorites,
};
