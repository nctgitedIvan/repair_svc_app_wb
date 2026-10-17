/**
 * 客服聊天（P7a-2b）—— 本機 Storage 模擬。
 *
 * ## 為什麼先放 Storage
 *
 * P5 會用真實 WebSocket／雲函數；本階段先把 **Schema** 定下來，
 * 讓 UI 與資料層解耦。之後只要把 `loadChats()`／`saveChats()` 換成 API，
 * 頁面不用改。
 *
 * ## Schema（`repair.chats.v1`）
 *
 * ```js
 * {
 *   version: 1,
 *   seq: 0,                       // 產生 messageId 的序號
 *   conversations: {
 *     [conversationId]: {
 *       conversationId, targetId, itemId,        // itemId = productId / serviceId
 *       messages: [ChatMessage],
 *       createdAt, updatedAt,
 *     }
 *   }
 * }
 *
 * ChatMessage = {
 *   messageId, conversationId,
 *   senderId, senderRole,         // customer / cs_agent / system
 *   type,                         // text / image / voice / product
 *   content,                      // 文字內容（其他類型可為空）
 *   imagePath,                    // 本機暫存路徑（P5 換成雲端 fileID）
 *   audioPath,                    // 語音暫存路徑（P7a 模擬錄音時為空）
 *   durationSeconds,              // 語音長度
 *   productSnapshot,              // { itemType, itemId, title, image, priceCents }
 *   quoted,                       // { messageId, type, senderRole, summary, imagePath? }
 *   createdAt,
 *   status,                       // sent / failed（P5 用）
 * }
 * ```
 *
 * 對應 P5 的未來集合：`chat_conversations`／`chat_messages`
 * （conversation_id、sender_role、msg_type、payload、quoted_message_id、created_at）。
 *
 * ⚠️ 圖片只存**本機暫存路徑**，不存 base64；否則 Storage 會爆。
 */

const STORAGE_KEY = 'repair.chats.v1';
const SCHEMA_VERSION = 1;
const MAX_MESSAGES_PER_CONVERSATION = 200;

/**
 * 預設客服 targetId（P7a 的 mock 客服）。
 *
 * ⚠️ 詳情頁、詢問頁、聊天頁**必須共用這個值**，否則 conversationId
 *    會不同，歷史記錄就接不起來。
 */
const DEFAULT_TARGET_ID = 'cs-1';

const MessageType = Object.freeze({
  TEXT: 'text',
  IMAGE: 'image',
  VOICE: 'voice',
  PRODUCT: 'product',
});

const SenderRole = Object.freeze({
  CUSTOMER: 'customer',
  CS_AGENT: 'cs_agent',
  SYSTEM: 'system',
});

const MESSAGE_TYPES = Object.freeze(Object.values(MessageType));
const SENDER_ROLES = Object.freeze(Object.values(SenderRole));

function hasStorage() {
  return typeof wx !== 'undefined' && wx && typeof wx.getStorageSync === 'function';
}

function emptyStore() {
  return { version: SCHEMA_VERSION, seq: 0, conversations: {} };
}

/** 從 Storage 讀取；任何損壞都回到空 store（聊天記錄不該讓頁面打不開） */
function loadChats() {
  if (!hasStorage()) return emptyStore();

  try {
    const raw = wx.getStorageSync(STORAGE_KEY);
    if (!raw) return emptyStore();
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return normalizeStore(parsed);
  } catch (err) {
    console.warn('[chat] 讀取聊天記錄失敗，使用空紀錄', err);
    return emptyStore();
  }
}

/** 寫回 Storage；失敗回 false（頁面顯示 Toast） */
function saveChats(store) {
  if (!hasStorage() || typeof wx.setStorageSync !== 'function') return false;
  try {
    wx.setStorageSync(STORAGE_KEY, store);
    return true;
  } catch (err) {
    console.warn('[chat] 儲存聊天記錄失敗', err);
    return false;
  }
}

/** 損壞資料的最小修復：只保留形狀正確的會話與訊息 */
function normalizeStore(raw) {
  const store = emptyStore();
  if (!raw || typeof raw !== 'object') return store;

  store.seq = Number.isInteger(raw.seq) && raw.seq >= 0 ? raw.seq : 0;
  const conversations = raw.conversations;
  if (!conversations || typeof conversations !== 'object') return store;

  for (const [id, conversation] of Object.entries(conversations)) {
    if (!conversation || typeof conversation !== 'object') continue;
    const messages = Array.isArray(conversation.messages)
      ? conversation.messages.filter(isValidStoredMessage)
      : [];

    store.conversations[id] = {
      conversationId: id,
      targetId: typeof conversation.targetId === 'string' ? conversation.targetId : '',
      itemId: typeof conversation.itemId === 'string' ? conversation.itemId : null,
      messages,
      createdAt: Number.isInteger(conversation.createdAt) ? conversation.createdAt : 0,
      updatedAt: Number.isInteger(conversation.updatedAt) ? conversation.updatedAt : 0,
    };
  }
  return store;
}

function isValidStoredMessage(message) {
  return (
    message &&
    typeof message.messageId === 'string' &&
    MESSAGE_TYPES.includes(message.type) &&
    SENDER_ROLES.includes(message.senderRole) &&
    Number.isInteger(message.createdAt)
  );
}

/** 對話識別碼：同一個客服＋同一個商品＝同一條對話 */
function conversationIdOf({ targetId, itemId } = {}) {
  const target = typeof targetId === 'string' && targetId ? targetId : DEFAULT_TARGET_ID;
  const item = typeof itemId === 'string' && itemId ? itemId : 'general';
  return `chat:${target}:${item}`;
}

function getConversation(store, conversationId) {
  return (store && store.conversations && store.conversations[conversationId]) || null;
}

/** 不存在就建立；回傳**新的** store（不修改傳入物件） */
function ensureConversation(store, { conversationId, targetId, itemId, now } = {}) {
  if (typeof conversationId !== 'string' || conversationId.length === 0) {
    return { ok: false, code: 'INVALID_CONVERSATION_ID' };
  }
  const current = getConversation(store, conversationId);
  if (current) return { ok: true, store, conversation: current };

  const next = clone(store && store.conversations ? store : emptyStore());
  next.conversations[conversationId] = {
    conversationId,
    targetId: typeof targetId === 'string' ? targetId : '',
    itemId: typeof itemId === 'string' ? itemId : null,
    messages: [],
    createdAt: Number.isInteger(now) ? now : 0,
    updatedAt: Number.isInteger(now) ? now : 0,
  };
  return { ok: true, store: next, conversation: next.conversations[conversationId] };
}

/**
 * 追加一則訊息。
 *
 * @param {object} store
 * @param {string} conversationId
 * @param {object} message { senderId, senderRole, type, content?, imagePath?, durationSeconds?, productSnapshot?, quoted? }
 * @param {number} now
 * @returns {{ok:true, store:object, message:object}|{ok:false, code:string}}
 */
function appendMessage(store, conversationId, message, now) {
  if (!getConversation(store, conversationId)) return { ok: false, code: 'CONVERSATION_NOT_FOUND' };
  if (!Number.isInteger(now)) return { ok: false, code: 'INVALID_TIME' };

  const invalid = validateMessage(message);
  if (invalid) return { ok: false, code: invalid };

  const next = clone(store);
  const conversation = next.conversations[conversationId];
  next.seq = (Number.isInteger(next.seq) ? next.seq : 0) + 1;

  const stored = {
    messageId: `msg-${now}-${next.seq}`,
    conversationId,
    senderId: message.senderId || '',
    senderRole: message.senderRole,
    type: message.type,
    content: typeof message.content === 'string' ? message.content : '',
    imagePath: typeof message.imagePath === 'string' ? message.imagePath : '',
    audioPath: typeof message.audioPath === 'string' ? message.audioPath : '',
    durationSeconds: Number.isInteger(message.durationSeconds) ? message.durationSeconds : 0,
    productSnapshot: message.productSnapshot ? clone(message.productSnapshot) : null,
    quoted: message.quoted ? clone(message.quoted) : null,
    createdAt: now,
    status: 'sent',
  };

  conversation.messages.push(stored);
  if (conversation.messages.length > MAX_MESSAGES_PER_CONVERSATION) {
    conversation.messages = conversation.messages.slice(-MAX_MESSAGES_PER_CONVERSATION);
  }
  conversation.updatedAt = now;

  return { ok: true, store: next, message: stored };
}

function validateMessage(message) {
  if (!message || typeof message !== 'object') return 'INVALID_MESSAGE';
  if (!MESSAGE_TYPES.includes(message.type)) return 'INVALID_TYPE';
  if (!SENDER_ROLES.includes(message.senderRole)) return 'INVALID_SENDER_ROLE';

  switch (message.type) {
    case MessageType.TEXT:
      return typeof message.content === 'string' && message.content.trim().length > 0
        ? null
        : 'EMPTY_TEXT';
    case MessageType.IMAGE:
      return typeof message.imagePath === 'string' && message.imagePath.length > 0
        ? null
        : 'MISSING_IMAGE';
    case MessageType.VOICE:
      return Number.isInteger(message.durationSeconds) &&
        message.durationSeconds >= 1 &&
        message.durationSeconds <= 60
        ? null
        : 'INVALID_DURATION';
    case MessageType.PRODUCT:
      return message.productSnapshot &&
        typeof message.productSnapshot === 'object' &&
        typeof message.productSnapshot.itemId === 'string' &&
        message.productSnapshot.itemId.length > 0
        ? null
        : 'MISSING_PRODUCT';
    default:
      return 'INVALID_TYPE';
  }
}

/** 引用訊息在畫面上的摘要 */
function quoteOf(message) {
  if (!message) return null;

  let summary = '';
  if (message.type === MessageType.TEXT) {
    summary = String(message.content || '').slice(0, 60);
  } else if (message.type === MessageType.IMAGE) {
    summary = '[圖片]';
  } else if (message.type === MessageType.VOICE) {
    summary = `[語音 ${message.durationSeconds}"]`;
  } else if (message.type === MessageType.PRODUCT) {
    summary = `[商品] ${(message.productSnapshot && message.productSnapshot.title) || ''}`;
  }

  return {
    messageId: message.messageId,
    type: message.type,
    senderRole: message.senderRole,
    summary,
    imagePath: message.type === MessageType.IMAGE ? message.imagePath : '',
  };
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

module.exports = {
  STORAGE_KEY,
  SCHEMA_VERSION,
  MAX_MESSAGES_PER_CONVERSATION,
  DEFAULT_TARGET_ID,
  MessageType,
  SenderRole,
  MESSAGE_TYPES,
  SENDER_ROLES,
  emptyStore,
  loadChats,
  saveChats,
  conversationIdOf,
  getConversation,
  ensureConversation,
  appendMessage,
  quoteOf,
};
