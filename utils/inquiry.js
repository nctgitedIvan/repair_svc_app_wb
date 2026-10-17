/**
 * 商品詢問（純函式 ＋ 本機持久化）。
 *
 * ## ⚠️ 這是 P7a 的臨時方案，P5 必須改
 *
 * 正式的詢問要寫進**資料庫集合** `inquiries`（`docs/01` §7.2 第 8 點），
 * 而集合是 **P2** 才建 —— P7a 階段沒有資料庫、沒有雲函數。
 *
 * 因此現在寫在**本機 Storage**，但 **schema 對齊後端**，
 * P7b 只需換掉讀寫來源（與 `utils/cart.js`／`utils/favorite.js` 相同的策略）。
 *
 * ## ⚠️ `customerId` 不得由前端決定
 *
 * 後端用 `cloud.getWXContext().OPENID` 查 `users` 決定擁有者
 * （`docs/01` §4.8.1）—— 前端若能自己傳，就可以冒充別人。
 * P7a 讀不到真實 openid，所以用**佔位符**寫進本機資料，
 * **讓形狀與後端一致**；P5 接上後端時這個欄位由後端填。
 *
 * ## 形狀（對應 `docs/01` §7.2 第 8 點）
 *
 * ```js
 * {
 *   items: [{
 *     inquiryId,            // 後端是 _id
 *     customerId,           // ← P7a 為佔位符
 *     productId,
 *     productSnapshot: { name, image, priceCents },  // 詢問當下的快照
 *     message,
 *     status: 'pending' | 'replied' | 'closed',
 *     createdAt,            // Unix ms
 *     csAgentId,
 *     replies: [{ actorId, actorRole, body, createdAt }],
 *   }],
 *   updatedAt,
 * }
 * ```
 *
 * ## ⚠️ 服務詢問不在 P7a 範圍
 *
 * `inquiries` 的鍵是 `product_id`（`docs/01` §7.2 第 8 點）。
 * 服務詳情頁的「客服」目前只給 Toast；若要支援服務，需把 schema
 * 擴充為 `item_type/item_id`（P2／P5 的變更）。
 */

const STORAGE_KEY = 'repair.inquiries.v1';

/**
 * ⚠️ **P7a 的 openid 佔位符。**
 * P5 接上後端後，`customerId` 由後端決定，前端**不得**再自行填寫。
 */
const LOCAL_CUSTOMER_ID = '__local__';

/** 本機詢問筆數上限（避免資料無限成長；後端版不需要這個限制） */
const MAX_INQUIRIES = 100;

/** 首次詢問內容的長度上限（與彈窗的 textarea 一致） */
const MAX_MESSAGE_LENGTH = 200;

/** 詢問狀態 */
const InquiryStatus = Object.freeze({
  PENDING: 'pending',
  REPLIED: 'replied',
  CLOSED: 'closed',
});

/** 狀態 → 畫面文字（純資料，頁面不自行判斷） */
const STATUS_LABEL = Object.freeze({
  [InquiryStatus.PENDING]: '待回覆',
  [InquiryStatus.REPLIED]: '已回覆',
  [InquiryStatus.CLOSED]: '已結束',
});

/** 錯誤碼 */
const InquiryCode = Object.freeze({
  /** 缺 productId／商品快照／合法時間 */
  INVALID: 'INVALID',
  /** 已達本機上限 */
  LIMIT_EXCEEDED: 'LIMIT_EXCEEDED',
});

function createStore() {
  return { items: [], updatedAt: null };
}

function ok(store, extra = {}) {
  return { ok: true, store, ...extra };
}
function fail(code, store = null) {
  return { ok: false, code, store };
}

/**
 * 商品 → 詢問快照（只留顯示需要的三個欄位）。
 * 主圖沿用 T6a.3 的規則：`images[0]`；`thumb` 僅作舊資料 fallback。
 */
function toSnapshot(item) {
  if (!item) return null;
  const images = Array.isArray(item.images) ? item.images.filter(Boolean) : [];
  return {
    name: item.name || '',
    image: images[0] || item.thumb || '',
    priceCents: Number.isInteger(item.priceCents) ? item.priceCents : 0,
  };
}

/** 訊息正規化：trim、空值給預設、截到上限（以字元為單位，避免切壞 emoji） */
function normalizeMessage(message, productName) {
  const text = typeof message === 'string' ? message.trim() : '';
  const fallback = `我想詢問「${productName || '這個商品'}」`;
  return Array.from(text || fallback).slice(0, MAX_MESSAGE_LENGTH).join('');
}

/** 產生不重複的本機 id（例：`inq-1700000000000`） */
function nextInquiryId(store, now) {
  const base = `inq-${now}`;
  const used = new Set((store.items || []).map((entry) => entry.inquiryId));
  if (!used.has(base)) return base;
  let suffix = 1;
  while (used.has(`${base}-${suffix}`)) suffix += 1;
  return `${base}-${suffix}`;
}

/**
 * 新增一筆詢問。
 *
 * @param {object} store
 * @param {{ productId: string, item: object, message?: string, now: number }} args
 *        `item` 是原始商品（含 `name`／`images`／`priceCents`），用來建快照
 * @returns {{ ok: boolean, store: object, inquiry?: object, code?: string }}
 */
function addInquiry(store, { productId, item, message, now } = {}) {
  const base = store && Array.isArray(store.items) ? store : createStore();

  if (!productId || typeof productId !== 'string') return fail(InquiryCode.INVALID, base);
  if (!Number.isInteger(now)) return fail(InquiryCode.INVALID, base);

  const snapshot = toSnapshot(item);
  if (!snapshot || !snapshot.name) return fail(InquiryCode.INVALID, base);
  if (base.items.length >= MAX_INQUIRIES) return fail(InquiryCode.LIMIT_EXCEEDED, base);

  const inquiry = {
    inquiryId: nextInquiryId(base, now),
    customerId: LOCAL_CUSTOMER_ID,
    productId,
    productSnapshot: snapshot,
    message: normalizeMessage(message, snapshot.name),
    status: InquiryStatus.PENDING,
    createdAt: now,
    csAgentId: null,
    replies: [],
  };

  return ok(
    {
      items: [...base.items.map((entry) => ({ ...entry })), inquiry],
      updatedAt: now,
    },
    { inquiry },
  );
}

/**
 * 詢問清單（新到舊）。
 *
 * ⚠️ 回傳的是**深拷貝**：呼叫端修改 `productSnapshot`／`replies`
 *    不應影響內部資料（與 `favorite.listFavorites()` 同一原則）。
 */
function listInquiries(store) {
  if (!store || !Array.isArray(store.items)) return [];
  return store.items
    .map((entry) => ({
      ...entry,
      productSnapshot: { ...entry.productSnapshot },
      replies: (entry.replies || []).map((reply) => ({ ...reply })),
    }))
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
}

/** 毫秒時間 → `YYYY-MM-DD HH:mm`（本機時區）；不合法回空字串 */
function formatTime(ts) {
  if (!Number.isInteger(ts) || ts <= 0) return '';
  const date = new Date(ts);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`;
}

/** 狀態文字（未知狀態一律視為待回覆，與 `normalizeStore` 一致） */
function statusLabelOf(status) {
  return STATUS_LABEL[status] || STATUS_LABEL[InquiryStatus.PENDING];
}

/**
 * 一筆詢問 → 清單列的顯示資料（「我的詢問」頁用）。
 * 純資料，不含文案判斷。
 */
function toRowModel(entry) {
  if (!entry) return null;
  const replies = Array.isArray(entry.replies) ? entry.replies : [];
  const lastReply = replies.length > 0 ? replies[replies.length - 1] : null;

  return {
    inquiryId: entry.inquiryId,
    productId: entry.productId,
    name: entry.productSnapshot ? entry.productSnapshot.name : '',
    image: entry.productSnapshot && entry.productSnapshot.image ? entry.productSnapshot.image : '',
    priceCents:
      entry.productSnapshot && Number.isInteger(entry.productSnapshot.priceCents)
        ? entry.productSnapshot.priceCents
        : 0,
    message: entry.message || '',
    status: entry.status,
    statusLabel: statusLabelOf(entry.status),
    createdAtText: formatTime(entry.createdAt),
    /** 最後一則客服回覆（P7a 的正常資料不會有；P5 接上後才有） */
    lastReply: lastReply && typeof lastReply.body === 'string' ? lastReply.body : '',
  };
}

// ── 持久化（有副作用，與純邏輯分開）──

/** 一筆資料是否存得起來（壞掉的就丟掉，見 `normalizeStore`） */
function isStorableEntry(entry) {
  return (
    !!entry &&
    typeof entry.inquiryId === 'string' &&
    entry.inquiryId.length > 0 &&
    typeof entry.productId === 'string' &&
    entry.productId.length > 0 &&
    !!entry.productSnapshot &&
    typeof entry.productSnapshot.name === 'string' &&
    entry.productSnapshot.name.length > 0
  );
}

/** 把 Storage 讀到的內容正規化成詢問資料。**純函式，可單獨測試。** */
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
    if (!isStorableEntry(entry) || seen.has(entry.inquiryId)) continue;
    if (items.length >= MAX_INQUIRIES) break;
    seen.add(entry.inquiryId);

    const status = Object.values(InquiryStatus).includes(entry.status)
      ? entry.status
      : InquiryStatus.PENDING;

    items.push({
      inquiryId: entry.inquiryId,
      customerId:
        typeof entry.customerId === 'string' && entry.customerId
          ? entry.customerId
          : LOCAL_CUSTOMER_ID,
      productId: entry.productId,
      productSnapshot: {
        name: entry.productSnapshot.name,
        image:
          typeof entry.productSnapshot.image === 'string' ? entry.productSnapshot.image : '',
        priceCents: Number.isInteger(entry.productSnapshot.priceCents)
          ? entry.productSnapshot.priceCents
          : 0,
      },
      message: typeof entry.message === 'string' ? entry.message : '',
      status,
      createdAt: Number.isInteger(entry.createdAt) ? entry.createdAt : null,
      csAgentId: typeof entry.csAgentId === 'string' ? entry.csAgentId : null,
      replies: Array.isArray(entry.replies)
        ? entry.replies
            .filter((reply) => reply && typeof reply.body === 'string')
            .map((reply) => ({
              actorId: typeof reply.actorId === 'string' ? reply.actorId : null,
              actorRole: typeof reply.actorRole === 'string' ? reply.actorRole : null,
              body: reply.body,
              createdAt: Number.isInteger(reply.createdAt) ? reply.createdAt : null,
            }))
        : [],
    });
  }

  return {
    items,
    updatedAt: Number.isInteger(parsed.updatedAt) ? parsed.updatedAt : null,
  };
}

function loadInquiries() {
  try {
    return normalizeStore(wx.getStorageSync(STORAGE_KEY));
  } catch (err) {
    console.warn('[inquiry] 讀取本機詢問失敗，改用空資料', err);
    return createStore();
  }
}

function saveInquiries(store) {
  try {
    wx.setStorageSync(STORAGE_KEY, JSON.stringify(store));
    return true;
  } catch (err) {
    console.warn('[inquiry] 儲存本機詢問失敗', err);
    return false;
  }
}

module.exports = {
  STORAGE_KEY,
  LOCAL_CUSTOMER_ID,
  MAX_INQUIRIES,
  MAX_MESSAGE_LENGTH,
  InquiryStatus,
  STATUS_LABEL,
  InquiryCode,
  createStore,
  toSnapshot,
  normalizeMessage,
  nextInquiryId,
  addInquiry,
  listInquiries,
  formatTime,
  statusLabelOf,
  toRowModel,
  normalizeStore,
  loadInquiries,
  saveInquiries,
};
