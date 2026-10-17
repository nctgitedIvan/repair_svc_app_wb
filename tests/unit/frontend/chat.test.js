'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const chat = require('../../../utils/chat');

const NOW = 1_700_000_000_000;

function withConversation(over = {}) {
  const conversationId = chat.conversationIdOf({ targetId: 'cs-1', itemId: 'prd-1' });
  const ensured = chat.ensureConversation(chat.emptyStore(), {
    conversationId,
    targetId: 'cs-1',
    itemId: 'prd-1',
    now: NOW,
    ...over,
  });
  return { conversationId, store: ensured.store };
}

function textMessage(content) {
  return {
    senderId: 'me',
    senderRole: chat.SenderRole.CUSTOMER,
    type: chat.MessageType.TEXT,
    content,
  };
}

test('conversationIdOf：同客服＋同商品＝同一條對話', () => {
  assert.equal(chat.DEFAULT_TARGET_ID, 'cs-1');
  assert.equal(
    chat.conversationIdOf({ targetId: chat.DEFAULT_TARGET_ID, itemId: 'prd-1' }),
    'chat:cs-1:prd-1',
  );
  assert.equal(chat.conversationIdOf({ targetId: chat.DEFAULT_TARGET_ID }), 'chat:cs-1:general');
  assert.equal(chat.conversationIdOf({}), 'chat:cs-1:general');
});

test('ensureConversation：不存在就建立，不修改傳入 store', () => {
  const empty = chat.emptyStore();
  const r = chat.ensureConversation(empty, {
    conversationId: 'chat:cs-1:general',
    targetId: 'cs-1',
    now: NOW,
  });

  assert.equal(r.ok, true);
  assert.equal(r.conversation.messages.length, 0);
  assert.equal(Object.keys(empty.conversations).length, 0, '原 store 不應被修改');

  const again = chat.ensureConversation(r.store, { conversationId: 'chat:cs-1:general', now: NOW + 1 });
  assert.equal(again.store, r.store, '已存在時原樣回傳');
});

test('appendMessage：文字、序號與時間', () => {
  const { conversationId, store } = withConversation();
  const r1 = chat.appendMessage(store, conversationId, textMessage('你好'), NOW);
  const r2 = chat.appendMessage(r1.store, conversationId, textMessage('想問冷氣'), NOW + 1);

  assert.equal(r1.ok, true);
  assert.equal(r1.message.messageId, `msg-${NOW}-1`);
  assert.equal(r2.message.messageId, `msg-${NOW + 1}-2`);
  assert.equal(r2.store.conversations[conversationId].messages.length, 2);
  assert.equal(r2.store.conversations[conversationId].updatedAt, NOW + 1);
  assert.equal(store.conversations[conversationId].messages.length, 0, '不修改原 store');
});

test('appendMessage：各訊息類型驗證', async (t) => {
  const { conversationId, store } = withConversation();
  const base = { senderId: 'me', senderRole: chat.SenderRole.CUSTOMER };

  await t.test('圖片需要 imagePath', () => {
    assert.equal(
      chat.appendMessage(store, conversationId, { ...base, type: chat.MessageType.IMAGE }, NOW).code,
      'MISSING_IMAGE',
    );
    assert.equal(
      chat.appendMessage(store, conversationId, { ...base, type: chat.MessageType.IMAGE, imagePath: 'a.png' }, NOW)
        .ok,
      true,
    );
  });

  await t.test('語音長度 1–60 秒，並保存 audioPath', () => {
    assert.equal(
      chat.appendMessage(store, conversationId, { ...base, type: chat.MessageType.VOICE, durationSeconds: 0 }, NOW)
        .code,
      'INVALID_DURATION',
    );
    const voice = chat.appendMessage(
      store,
      conversationId,
      {
        ...base,
        type: chat.MessageType.VOICE,
        durationSeconds: 3,
        audioPath: 'wxfile://voice.mp3',
      },
      NOW,
    );
    assert.equal(voice.ok, true);
    assert.equal(voice.message.audioPath, 'wxfile://voice.mp3');
  });

  await t.test('商品卡片需要 snapshot', () => {
    assert.equal(
      chat.appendMessage(store, conversationId, { ...base, type: chat.MessageType.PRODUCT }, NOW).code,
      'MISSING_PRODUCT',
    );
    assert.equal(
      chat.appendMessage(
        store,
        conversationId,
        {
          ...base,
          type: chat.MessageType.PRODUCT,
          productSnapshot: { itemType: 'product', itemId: 'prd-1', title: '冷媒', image: '', priceCents: 2500 },
        },
        NOW,
      ).ok,
      true,
    );
  });

  await t.test('未知對話／未知類型被拒絕', () => {
    assert.equal(chat.appendMessage(store, 'nope', textMessage('x'), NOW).code, 'CONVERSATION_NOT_FOUND');
    assert.equal(chat.appendMessage(store, conversationId, { ...textMessage('x'), type: 'weird' }, NOW).code, 'INVALID_TYPE');
  });
});

test('appendMessage：引用與摘要', () => {
  const { conversationId, store } = withConversation();
  const first = chat.appendMessage(store, conversationId, textMessage('這台冷氣適合嗎？'), NOW);
  const quoted = chat.quoteOf(first.message);

  const second = chat.appendMessage(
    first.store,
    conversationId,
    { ...textMessage('請看這則'), quoted },
    NOW + 1,
  );

  assert.deepEqual(second.message.quoted, {
    messageId: first.message.messageId,
    type: 'text',
    senderRole: 'customer',
    summary: '這台冷氣適合嗎？',
    imagePath: '',
  });
});

test('appendMessage：超過上限時保留最新訊息', () => {
  let { conversationId, store } = withConversation();
  for (let i = 0; i < chat.MAX_MESSAGES_PER_CONVERSATION + 5; i += 1) {
    store = chat.appendMessage(store, conversationId, textMessage(`m${i}`), NOW + i).store;
  }
  const messages = store.conversations[conversationId].messages;
  assert.equal(messages.length, chat.MAX_MESSAGES_PER_CONVERSATION);
  assert.equal(messages[messages.length - 1].content, `m${chat.MAX_MESSAGES_PER_CONVERSATION + 4}`);
});

test('loadChats／saveChats：無 wx 時安全降級', () => {
  assert.deepEqual(chat.loadChats(), chat.emptyStore());
  assert.equal(chat.saveChats(chat.emptyStore()), false);
});
