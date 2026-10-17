import Toast from 'tdesign-miniprogram/toast/index';
import dayjs from 'dayjs';
import { fetchProductDetail, fetchServiceDetail } from '../../services/api/index';

const chat = require('../../utils/chat.js');
const inquiryRules = require('../../utils/inquiry.js');

/**
 * 全域單例音訊播放器。
 *
 * `wx.createInnerAudioContext()` 每次建立都會佔用一個原生播放器；
 * 聊天頁反覆進出時若每次 new 一個，會累積到上限（模擬器尤其容易）。
 * 因此整個 app 只保留一個 context，重複使用。
 */
let sharedAudioContext = null;

function getAudioContext() {
  if (typeof wx === 'undefined' || typeof wx.createInnerAudioContext !== 'function') {
    return null;
  }
  if (!sharedAudioContext) {
    sharedAudioContext = wx.createInnerAudioContext();
  }
  return sharedAudioContext;
}

/** 模擬客服的自動回覆（P5 接上 WebSocket 後移除） */
const AUTO_GREETING = '您好，請問有什麼可以幫您？';
const AUTO_REPLY = '收到，客服會盡快回覆您。';

const EMOJIS = [
  '😀', '😁', '😂', '🤣', '😊', '😍', '🤔', '😭',
  '😡', '👍', '🙏', '🎉', '❤️', '🔥', '👌', '💪',
  '🌹', '☕', '😴', '🤝', '👏', '😅', '🙌', '✨',
];

/**
 * 客服聊天（P7a-2b，Storage 模擬）。
 *
 * ## 資料
 *
 * `utils/chat.js`：`repair.chats.v1`。訊息 Schema 已預留 P5 的
 * `chat_conversations`／`chat_messages`（sender_role、msg_type、quoted…）。
 *
 * ## 路由
 *
 * `/pages/chat/index?targetId=cs-1&productId=prd-1`
 * （服務用 `serviceId`）。帶商品／服務 id 且對話為空時，
 * 自動送出一張商品卡片；同一條對話不重複送。
 */
Page({
  data: {
    targetId: 'cs-1',
    itemId: '',
    conversationId: '',
    messages: [],
    inputValue: '',
    inputFocus: false,
    isVoiceMode: false,
    /** '' | 'emoji' | 'more' */
    panel: '',
    emojis: EMOJIS,
    quote: null,
    scrollIntoView: '',
    playingMessageId: '',
    voiceRecording: false,
    recordingSeconds: 0,
  },

  store: null,
  itemType: '',
  replyTimer: null,
  playTimer: null,
  recordTimer: null,
  /** 播放序號：切換／停止時遞增，避免舊的 onEnded 清掉新播放狀態 */
  playToken: 0,
  unloaded: false,

  onLoad(query) {
    const params = query || {};
    const productId = params.productId || '';
    const serviceId = params.serviceId || '';
    const itemId = productId || serviceId || '';
    const targetId = params.targetId || chat.DEFAULT_TARGET_ID;

    this.itemType = productId ? 'product' : serviceId ? 'service' : '';
    this.inquiryId = params.inquiryId || '';

    this.setData({
      targetId,
      itemId,
      conversationId: chat.conversationIdOf({ targetId, itemId }),
    });

    this.init();
  },

  onHide() {
    // 離開頁面就停止播放，避免背景音訊繼續
    this.stopPlayback();
  },

  onUnload() {
    this.unloaded = true;
    this.stopPlayback();
    if (this.replyTimer) clearTimeout(this.replyTimer);
    if (this.recordTimer) clearInterval(this.recordTimer);
  },

  async init() {
    const { targetId, itemId, conversationId } = this.data;

    this.store = chat.loadChats();
    const ensured = chat.ensureConversation(this.store, {
      conversationId,
      targetId,
      itemId,
      now: Date.now(),
    });
    if (!ensured.ok) {
      Toast({ context: this, selector: '#t-toast', message: '聊天室開啟失敗', icon: '' });
      return;
    }
    this.store = ensured.store;
    chat.saveChats(this.store);

    const conversation = chat.getConversation(this.store, conversationId);
    const empty = !conversation || conversation.messages.length === 0;
    this.refreshMessages();

    if (!empty) return;

    // 商品／服務卡片只送一次（同一條對話不重複）
    if (itemId) {
      await this.sendProductCard();
    }

    // 從「我的詢問」進來時，把原本的詢問與客服回覆補進同一條對話
    const seededReply = this.seedInquiryHistory();

    // 已經有客服回覆就不再加自動問候
    if (!seededReply) {
      this.scheduleAutoReply(AUTO_GREETING, itemId ? 900 : 500);
    }
  },

  /**
   * 把舊詢問的內容與回覆補進聊天歷史。
   *
   * 只在對話為空時呼叫；回傳 true 表示已有客服回覆，頁面不再送自動問候。
   */
  seedInquiryHistory() {
    if (!this.inquiryId) return false;

    let inquiries = [];
    try {
      inquiries = inquiryRules.listInquiries(inquiryRules.loadInquiries());
    } catch (err) {
      console.warn('[chat] 讀取詢問歷史失敗', err);
      return false;
    }

    const inquiry = inquiries.find((entry) => entry.inquiryId === this.inquiryId);
    if (!inquiry) return false;

    if (inquiry.message) {
      this.appendAndRender({
        senderId: 'me',
        senderRole: chat.SenderRole.CUSTOMER,
        type: chat.MessageType.TEXT,
        content: inquiry.message,
      });
    }

    const replies = Array.isArray(inquiry.replies) ? inquiry.replies : [];
    for (const reply of replies) {
      if (!reply || typeof reply.body !== 'string' || reply.body.length === 0) continue;
      this.appendAndRender({
        senderId: reply.actorId || this.data.targetId,
        senderRole:
          reply.actorRole === chat.SenderRole.CUSTOMER
            ? chat.SenderRole.CUSTOMER
            : chat.SenderRole.CS_AGENT,
        type: chat.MessageType.TEXT,
        content: reply.body,
      });
    }

    return replies.some((reply) => reply && typeof reply.body === 'string' && reply.body.length > 0);
  },

  /** 自動送出一張商品卡片（商品／服務共用） */
  async sendProductCard() {
    const { itemId } = this.data;

    try {
      let item;
      if (this.itemType === 'service') {
        const result = await fetchServiceDetail(itemId);
        item = result.service;
      } else {
        item = await fetchProductDetail(itemId);
      }

      const snapshot = {
        itemType: this.itemType,
        itemId,
        title: item.name || '',
        image: Array.isArray(item.images) && item.images.length > 0 ? item.images[0] : '',
        priceCents: Number.isInteger(item.priceCents) ? item.priceCents : 0,
      };

      this.appendAndRender({
        senderId: 'me',
        senderRole: chat.SenderRole.CUSTOMER,
        type: chat.MessageType.PRODUCT,
        productSnapshot: snapshot,
      });
    } catch (err) {
      console.warn('[chat] 商品資料載入失敗', err);
      Toast({ context: this, selector: '#t-toast', message: '商品資料載入失敗', icon: '' });
    }
  },

  /** 把 store 中的對話轉成畫面資料 */
  refreshMessages() {
    const conversation = chat.getConversation(this.store, this.data.conversationId);
    const messages = (conversation ? conversation.messages : []).map((message) => ({
      ...message,
      isSelf: message.senderRole === chat.SenderRole.CUSTOMER,
      timeText: dayjs(message.createdAt).format('HH:mm'),
      voiceWidth: `${Math.min(120 + (message.durationSeconds || 0) * 20, 380)}rpx`,
      quoteImagePath: message.quoted && message.quoted.imagePath ? message.quoted.imagePath : '',
    }));

    this.setData({ messages }, () => this.scrollToBottom());
  },

  appendAndRender(message) {
    const result = chat.appendMessage(
      this.store,
      this.data.conversationId,
      message,
      Date.now(),
    );
    if (!result.ok) {
      Toast({ context: this, selector: '#t-toast', message: '訊息送出失敗', icon: '' });
      return null;
    }

    this.store = result.store;
    if (!chat.saveChats(this.store)) {
      Toast({ context: this, selector: '#t-toast', message: '本機儲存失敗', icon: '' });
    }
    this.refreshMessages();
    return result.message;
  },

  /** 模擬客服回覆（P5 換成 WebSocket 推播） */
  scheduleAutoReply(text, delay = 700) {
    if (this.replyTimer) clearTimeout(this.replyTimer);
    this.replyTimer = setTimeout(() => {
      if (this.unloaded) return;
      this.appendAndRender({
        senderId: this.data.targetId,
        senderRole: chat.SenderRole.CS_AGENT,
        type: chat.MessageType.TEXT,
        content: text,
      });
    }, delay);
  },

  scrollToBottom() {
    const { messages } = this.data;
    if (messages.length === 0) return;
    this.setData({ scrollIntoView: `msg-${messages[messages.length - 1].messageId}` });
  },

  // ── 輸入 ──

  onInputChange(e) {
    this.setData({ inputValue: (e.detail && e.detail.value) || '' });
  },

  onInputFocus() {
    this.setData({ inputFocus: true, panel: '' });
    setTimeout(() => this.scrollToBottom(), 300);
  },

  onInputBlur() {
    this.setData({ inputFocus: false });
  },

  onSend() {
    const text = (this.data.inputValue || '').trim();
    if (!text) return;

    this.appendAndRender({
      senderId: 'me',
      senderRole: chat.SenderRole.CUSTOMER,
      type: chat.MessageType.TEXT,
      content: text,
      quoted: this.data.quote,
    });

    this.setData({ inputValue: '', quote: null, panel: '', inputFocus: false });
    this.scheduleAutoReply(AUTO_REPLY);
  },

  // ── 面板 ──

  toggleVoiceMode() {
    this.setData({
      isVoiceMode: !this.data.isVoiceMode,
      panel: '',
      inputFocus: false,
    });
  },

  togglePanel(e) {
    const { panel } = e.currentTarget.dataset;
    const next = this.data.panel === panel ? '' : panel;
    this.setData({ panel: next, inputFocus: false });
    if (next) setTimeout(() => this.scrollToBottom(), 100);
  },

  onEmojiTap(e) {
    const { emoji } = e.currentTarget.dataset;
    this.setData({ inputValue: `${this.data.inputValue}${emoji}` });
  },

  // ── 語音 ──

  onVoiceStart() {
    if (!this.data.isVoiceMode) return;

    this.setData({ voiceRecording: true, recordingSeconds: 0 });
    if (wx.vibrateShort) wx.vibrateShort({ type: 'light' });

    this.recordTimer = setInterval(() => {
      if (!this.data.voiceRecording) return;
      const next = this.data.recordingSeconds + 1;
      if (next >= 60) {
        this.onVoiceEnd();
        return;
      }
      this.setData({ recordingSeconds: next });
    }, 1000);
  },

  onVoiceEnd() {
    if (!this.data.voiceRecording) return;

    if (this.recordTimer) {
      clearInterval(this.recordTimer);
      this.recordTimer = null;
    }

    const duration = this.data.recordingSeconds;
    this.setData({ voiceRecording: false, recordingSeconds: 0 });

    if (duration < 1) {
      Toast({ context: this, selector: '#t-toast', message: '說話時間太短', icon: '' });
      return;
    }

    this.appendAndRender({
      senderId: 'me',
      senderRole: chat.SenderRole.CUSTOMER,
      type: chat.MessageType.VOICE,
      durationSeconds: duration,
      quoted: this.data.quote,
    });
    this.setData({ quote: null });
    this.scheduleAutoReply(AUTO_REPLY);
  },

  onVoiceCancel() {
    if (this.recordTimer) {
      clearInterval(this.recordTimer);
      this.recordTimer = null;
    }
    this.setData({ voiceRecording: false, recordingSeconds: 0 });
  },

  /** 點語音氣泡：模擬播放（無音訊時用 setTimeout 收斂） */
  onVoiceTap(e) {
    const { id, duration, audioPath } = e.currentTarget.dataset;
    if (!id) return;

    // 再點一次同一則 → 停止
    if (this.data.playingMessageId === id) {
      this.stopPlayback();
      return;
    }

    this.stopPlayback();
    this.setData({ playingMessageId: id });

    // 有真實音訊才播放；模擬器／舊資料沒有 audioPath 時用動畫模擬 3 秒
    if (audioPath && this.playAudio(audioPath, duration)) return;
    this.simulatePlayback();
  },

  /** 用全域單例播放真實音訊；成功回 true */
  playAudio(src, duration) {
    const ctx = getAudioContext();
    if (!ctx) return false;

    const token = (this.playToken || 0) + 1;
    this.playToken = token;

    try {
      if (typeof ctx.offEnded === 'function') ctx.offEnded();
      if (typeof ctx.offError === 'function') ctx.offError();

      ctx.onEnded(() => {
        if (this.playToken === token) this.finishPlayback();
      });
      ctx.onError(() => {
        if (this.playToken !== token) return;
        this.finishPlayback();
        Toast({ context: this, selector: '#t-toast', message: '語音播放失敗', icon: '' });
      });

      ctx.src = src;
      ctx.play();
    } catch (err) {
      console.warn('[chat] 音訊播放失敗', err);
      return false;
    }

    // 保險：部分基礎庫不一定觸發 onEnded
    const seconds = Math.max(1, Number(duration) || 3);
    this.playTimer = setTimeout(() => {
      if (this.playToken === token) this.finishPlayback();
    }, (seconds + 1) * 1000);
    return true;
  },

  /** 無音訊時的 3 秒動畫模擬 */
  simulatePlayback() {
    if (this.playTimer) clearTimeout(this.playTimer);
    this.playTimer = setTimeout(() => {
      if (!this.unloaded) this.finishPlayback();
    }, 3000);
  },

  finishPlayback() {
    if (this.playTimer) {
      clearTimeout(this.playTimer);
      this.playTimer = null;
    }
    if (!this.unloaded) this.setData({ playingMessageId: '' });
  },

  stopPlayback() {
    if (this.playTimer) {
      clearTimeout(this.playTimer);
      this.playTimer = null;
    }
    this.playToken = (this.playToken || 0) + 1;

    const ctx = sharedAudioContext;
    if (ctx) {
      try {
        ctx.stop();
      } catch (err) {
        // 尚未播放時 stop 可能拋錯，忽略
      }
    }
    if (!this.unloaded) this.setData({ playingMessageId: '' });
  },

  // ── 圖片 ──

  chooseImage() {
    const onSuccess = (path) => {
      if (!path) return;
      this.setData({ panel: '' });
      this.appendAndRender({
        senderId: 'me',
        senderRole: chat.SenderRole.CUSTOMER,
        type: chat.MessageType.IMAGE,
        imagePath: path,
        quoted: this.data.quote,
      });
      this.setData({ quote: null });
      this.scheduleAutoReply(AUTO_REPLY);
    };

    if (wx.chooseMedia) {
      wx.chooseMedia({
        count: 1,
        mediaType: ['image'],
        sourceType: ['album', 'camera'],
        sizeType: ['compressed'],
        success: (res) => {
          const file = res.tempFiles && res.tempFiles[0];
          onSuccess(file && file.tempFilePath);
        },
        fail: () => {},
      });
      return;
    }

    if (wx.chooseImage) {
      wx.chooseImage({
        count: 1,
        sizeType: ['compressed'],
        sourceType: ['album', 'camera'],
        success: (res) => onSuccess(res.tempFilePaths && res.tempFilePaths[0]),
        fail: () => {},
      });
      return;
    }

    Toast({ context: this, selector: '#t-toast', message: '此版本不支援圖片上傳', icon: '' });
  },

  // ── 引用與商品卡 ──

  onMessageLongPress(e) {
    const { id } = e.currentTarget.dataset;
    const conversation = chat.getConversation(this.store, this.data.conversationId);
    const message = conversation ? conversation.messages.find((entry) => entry.messageId === id) : null;
    if (!message) return;

    wx.showActionSheet({
      itemList: ['引用'],
      success: (res) => {
        if (res.tapIndex !== 0) return;
        this.setData({ quote: chat.quoteOf(message), panel: '' });
      },
      fail: () => {},
    });
  },

  onCancelQuote() {
    this.setData({ quote: null });
  },

  onProductTap(e) {
    const { itemType, itemId } = e.currentTarget.dataset;
    if (!itemId) return;
    const param = itemType === 'service' ? `serviceId=${itemId}` : `productId=${itemId}`;
    wx.navigateTo({ url: `/pages/goods/details/index?${param}` });
  },
});
