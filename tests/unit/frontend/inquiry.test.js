'use strict';

/**
 * 商品詢問（T6b）純函式與 Storage 正規化的測試。
 *
 * 重點：
 *   1. 快照沿用 T6a.3 的 `images[0]`（不再有 thumb）
 *   2. 預設訊息、trim、200 字截斷
 *   3. 正規化：單筆壞掉不該毀掉整份；狀態非法視為 pending
 *   4. 清單新到舊、回傳深拷貝
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const inquiry = require('../../../utils/inquiry');
const { PRODUCTS } = require('../../../services/api/_fake/data');

const NOW = 1_700_000_000_000;
const ITEM = {
  productId: 'prd-1',
  name: '冷媒 R410',
  images: ['https://x/1.png', 'https://x/2.png'],
  priceCents: 2500,
};

const add = (store, over = {}) =>
  inquiry.addInquiry(store, {
    productId: 'prd-1',
    item: ITEM,
    message: '想問規格',
    now: NOW,
    ...over,
  });

test('toSnapshot：詢問當下的商品快照', async (t) => {
  await t.test('名稱／主圖／價格（分）', () => {
    assert.deepEqual(inquiry.toSnapshot(ITEM), {
      name: '冷媒 R410',
      image: 'https://x/1.png',
      priceCents: 2500,
    });
  });

  await t.test('⚠️ 主圖讀 images[0]；thumb 只當舊資料 fallback', () => {
    assert.equal(inquiry.toSnapshot({ name: 'x', images: ['a.png', 'b.png'] }).image, 'a.png');
    assert.equal(inquiry.toSnapshot({ name: 'x', images: [], thumb: 'old.png' }).image, 'old.png');
  });

  await t.test('缺欄位不留下 undefined', () => {
    assert.deepEqual(inquiry.toSnapshot({ name: 'x' }), { name: 'x', image: '', priceCents: 0 });
    assert.equal(inquiry.toSnapshot(null), null);
  });
});

test('addInquiry：新增一筆待回覆的詢問', async (t) => {
  await t.test('基本欄位與 pending 狀態', () => {
    const result = add(inquiry.createStore());
    assert.equal(result.ok, true);
    assert.equal(result.store.items.length, 1);

    const entry = result.inquiry;
    assert.equal(entry.customerId, inquiry.LOCAL_CUSTOMER_ID);
    assert.equal(entry.productId, 'prd-1');
    assert.deepEqual(entry.productSnapshot, {
      name: '冷媒 R410',
      image: 'https://x/1.png',
      priceCents: 2500,
    });
    assert.equal(entry.message, '想問規格');
    assert.equal(entry.status, inquiry.InquiryStatus.PENDING);
    assert.equal(entry.createdAt, NOW);
    assert.equal(entry.csAgentId, null);
    assert.deepEqual(entry.replies, []);
  });

  await t.test('空白訊息 → 預設「我想詢問「{商品名}」」', () => {
    assert.equal(add(inquiry.createStore(), { message: '' }).inquiry.message, '我想詢問「冷媒 R410」');
    assert.equal(add(inquiry.createStore(), { message: '   ' }).inquiry.message, '我想詢問「冷媒 R410」');
    assert.equal(add(inquiry.createStore(), { message: undefined }).inquiry.message, '我想詢問「冷媒 R410」');
  });

  await t.test('訊息會 trim', () => {
    assert.equal(add(inquiry.createStore(), { message: '  想問規格  ' }).inquiry.message, '想問規格');
  });

  await t.test('訊息超過 200 字會截斷', () => {
    const long = 'a'.repeat(250);
    assert.equal(add(inquiry.createStore(), { message: long }).inquiry.message.length, 200);
  });

  await t.test('缺 productId／商品名稱不對／時間不合法 → INVALID', () => {
    assert.equal(add(inquiry.createStore(), { productId: '' }).code, inquiry.InquiryCode.INVALID);
    assert.equal(add(inquiry.createStore(), { item: { name: '' } }).code, inquiry.InquiryCode.INVALID);
    assert.equal(add(inquiry.createStore(), { item: null }).code, inquiry.InquiryCode.INVALID);
    assert.equal(add(inquiry.createStore(), { now: undefined }).code, inquiry.InquiryCode.INVALID);
    assert.equal(add(inquiry.createStore(), { now: 1.5 }).code, inquiry.InquiryCode.INVALID);
  });

  await t.test('達到 100 筆上限 → LIMIT_EXCEEDED', () => {
    const store = {
      items: Array.from({ length: 100 }, (_, i) => ({ inquiryId: `inq-${i}` })),
      updatedAt: NOW,
    };
    const result = add(store);
    assert.equal(result.ok, false);
    assert.equal(result.code, inquiry.InquiryCode.LIMIT_EXCEEDED);
    assert.equal(result.store.items.length, 100);
  });

  await t.test('inquiryId 碰撞時加後綴', () => {
    const store = { items: [{ inquiryId: `inq-${NOW}` }], updatedAt: NOW };
    assert.equal(add(store).inquiry.inquiryId, `inq-${NOW}-1`);
  });

  await t.test('不修改傳入的 store', () => {
    const store = inquiry.createStore();
    add(store);
    assert.equal(store.items.length, 0);
  });
});

test('listInquiries：新到舊＋深拷貝', async (t) => {
  await t.test('createdAt 由新到舊', () => {
    let store = inquiry.createStore();
    store = add(store, { now: NOW }).store;
    store = add(store, { now: NOW + 1000 }).store;
    store = add(store, { now: NOW + 500 }).store;

    assert.deepEqual(
      inquiry.listInquiries(store).map((entry) => entry.createdAt),
      [NOW + 1000, NOW + 500, NOW],
    );
  });

  await t.test('修改回傳值不影響原 store（快照與 replies 都是拷貝）', () => {
    const store = {
      items: [
        {
          inquiryId: 'inq-1',
          customerId: inquiry.LOCAL_CUSTOMER_ID,
          productId: 'prd-1',
          productSnapshot: { name: '冷媒 R410', image: 'x.png', priceCents: 2500 },
          message: 'm',
          status: 'replied',
          createdAt: NOW,
          csAgentId: 'cs-1',
          replies: [{ actorId: 'cs-1', actorRole: 'cs_agent', body: '回覆', createdAt: NOW + 1 }],
        },
      ],
      updatedAt: NOW,
    };

    const list = inquiry.listInquiries(store);
    list[0].productSnapshot.name = '被改了';
    list[0].replies[0].body = '被改了';
    assert.equal(store.items[0].productSnapshot.name, '冷媒 R410');
    assert.equal(store.items[0].replies[0].body, '回覆');
  });

  await t.test('空資料不爆', () => {
    assert.deepEqual(inquiry.listInquiries(null), []);
    assert.deepEqual(inquiry.listInquiries({}), []);
  });
});

test('toRowModel／statusLabelOf：清單顯示資料', async (t) => {
  const entry = {
    inquiryId: 'inq-1',
    productId: 'prd-1',
    productSnapshot: { name: '冷媒 R410', image: 'x.png', priceCents: 2500 },
    message: '想問規格',
    status: 'replied',
    createdAt: NOW,
    replies: [
      { actorId: 'cs-1', actorRole: 'cs_agent', body: '第一則', createdAt: NOW + 1 },
      { actorId: 'cs-1', actorRole: 'cs_agent', body: '最後一則', createdAt: NOW + 2 },
    ],
  };

  await t.test('狀態文字（未知狀態視為待回覆）', () => {
    assert.equal(inquiry.statusLabelOf('pending'), '待回覆');
    assert.equal(inquiry.statusLabelOf('replied'), '已回覆');
    assert.equal(inquiry.statusLabelOf('closed'), '已結束');
    assert.equal(inquiry.statusLabelOf('unknown'), '待回覆');
  });

  await t.test('列資料：快照、訊息、狀態、時間、最後一則回覆', () => {
    const row = inquiry.toRowModel(entry);
    assert.equal(row.name, '冷媒 R410');
    assert.equal(row.image, 'x.png');
    assert.equal(row.priceCents, 2500);
    assert.equal(row.message, '想問規格');
    assert.equal(row.statusLabel, '已回覆');
    assert.equal(row.lastReply, '最後一則');
    assert.match(row.createdAtText, /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);
  });

  await t.test('沒有回覆時 lastReply 為空字串', () => {
    assert.equal(inquiry.toRowModel({ ...entry, replies: [] }).lastReply, '');
    assert.equal(inquiry.toRowModel({ ...entry, replies: undefined }).lastReply, '');
  });

  await t.test('null → null', () => {
    assert.equal(inquiry.toRowModel(null), null);
  });
});

test('formatTime：時間格式', async (t) => {
  await t.test('不合法回空字串', () => {
    assert.equal(inquiry.formatTime(null), '');
    assert.equal(inquiry.formatTime(0), '');
    assert.equal(inquiry.formatTime(-1), '');
    assert.equal(inquiry.formatTime('1700000000000'), '');
  });

  await t.test('合法時間回 YYYY-MM-DD HH:mm', () => {
    assert.match(inquiry.formatTime(NOW), /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);
  });
});

test('normalizeStore：壞資料的處理', async (t) => {
  const valid = {
    inquiryId: 'inq-1',
    customerId: inquiry.LOCAL_CUSTOMER_ID,
    productId: 'prd-1',
    productSnapshot: { name: '冷媒 R410', image: 'x.png', priceCents: 2500 },
    message: 'm',
    status: 'pending',
    createdAt: NOW,
    csAgentId: null,
    replies: [],
  };

  await t.test('JSON 字串可解析', () => {
    const store = inquiry.normalizeStore(JSON.stringify({ items: [valid], updatedAt: NOW }));
    assert.equal(store.items.length, 1);
    assert.equal(store.updatedAt, NOW);
  });

  await t.test('無法解析／形狀不對 → 空資料', () => {
    assert.deepEqual(inquiry.normalizeStore('{bad json'), inquiry.createStore());
    assert.deepEqual(inquiry.normalizeStore({ items: 'no' }), inquiry.createStore());
    assert.deepEqual(inquiry.normalizeStore(null), inquiry.createStore());
  });

  await t.test('單筆壞掉只丟那一筆', () => {
    const store = inquiry.normalizeStore({
      items: [
        valid,
        { ...valid, inquiryId: '' },
        { ...valid, inquiryId: 'inq-2', productId: '' },
        { ...valid, inquiryId: 'inq-3', productSnapshot: { name: '' } },
        { ...valid, inquiryId: 'inq-4', productSnapshot: null },
      ],
    });
    assert.deepEqual(store.items.map((entry) => entry.inquiryId), ['inq-1']);
  });

  await t.test('重複 inquiryId 只留第一筆', () => {
    const store = inquiry.normalizeStore({
      items: [valid, { ...valid, message: '第二筆' }],
    });
    assert.equal(store.items.length, 1);
    assert.equal(store.items[0].message, 'm');
  });

  await t.test('缺 customerId 補佔位符；狀態非法視為 pending', () => {
    const store = inquiry.normalizeStore({
      items: [{ ...valid, customerId: undefined, status: 'weird' }],
    });
    assert.equal(store.items[0].customerId, inquiry.LOCAL_CUSTOMER_ID);
    assert.equal(store.items[0].status, inquiry.InquiryStatus.PENDING);
  });

  await t.test('replies 只留 body 是字串的項目', () => {
    const store = inquiry.normalizeStore({
      items: [
        {
          ...valid,
          replies: [
            { body: 'ok', actorId: 'cs-1', actorRole: 'cs_agent', createdAt: NOW },
            { nope: true },
            null,
          ],
        },
      ],
    });
    assert.equal(store.items[0].replies.length, 1);
    assert.equal(store.items[0].replies[0].body, 'ok');
  });

  await t.test('最多留 100 筆', () => {
    const items = Array.from({ length: 120 }, (_, i) => ({ ...valid, inquiryId: `inq-${i}` }));
    assert.equal(inquiry.normalizeStore({ items }).items.length, inquiry.MAX_INQUIRIES);
  });
});

test('與真實 fake 資料對齊', async (t) => {
  await t.test('prd-1 的快照圖是 images[0]', () => {
    const product = PRODUCTS.find((p) => p.productId === 'prd-1');
    const snapshot = inquiry.toSnapshot(product);
    assert.equal(snapshot.name, product.name);
    assert.equal(snapshot.image, product.images[0]);
    assert.equal(snapshot.priceCents, product.priceCents);
  });
});
