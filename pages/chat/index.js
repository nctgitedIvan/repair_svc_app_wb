import Toast from 'tdesign-miniprogram/toast/index';
import dayjs from 'dayjs';
import { fetchProductDetail, fetchServiceDetail } from '../../services/api/index';

const chat = require('../../utils/chat.js');

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
  unloaded: false,

  onLoad(query) {
    const params = query || {};
    const productId = params.productId || '';
    const serviceId = params.serviceId || '';
    const itemId = productId || serviceId || '';
    const targetId = params.targetId || 'cs-1';

    this.itemType = productId ? 'product' : serviceId ? 'service' : '';

    this.setData({
      targetId,
      itemId,
      conversationId: chat.conversationIdOf({ targetId, itemId }),
    });

    this.init();
  },

  onUnload() {
    this.unloaded = true;
    if (this.replyTimer) clearTimeout(this.replyTimer);
    if (this.playTimer) clearTimeout(this.playTimer);
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

    this.scheduleAutoReply(AUTO_GREETING, itemId ? 900 : 500);
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
    const { id, duration } = e.currentTarget.dataset;
    if (!id) return;

    if (this.playTimer) clearTimeout(this.playTimer);
    if (this.data.playingMessageId === id) {
      this.setData({ playingMessageId: '' });
      return;
    }

    this.setData({ playingMessageId: id });
    const seconds = Math.max(1, Number(duration) || 3);
    this.playTimer = setTimeout(() => {
      if (!this.unloaded) this.setData({ playingMessageId: '' });
    }, seconds * 1000);
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
