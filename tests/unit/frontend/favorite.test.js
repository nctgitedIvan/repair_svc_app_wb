'use strict';

/**
 * 收藏（本機 Storage 版）的測試。
 *
 * 重點：
 *   1. 切換收藏的行為（含「已收藏不重複、且**不更新快照**」）
 *   2. 快照的內容（名稱／圖／**收藏當下的價格**）
 *   3. `normalizeStore` 的容錯（與 cart 同一套原則：單筆壞掉不毀整份）
 *   4. ⚠️ `customerId` 是佔位符 —— P5 要改為後端以 OPENID 判定
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const fav = require('../../../utils/favorite');

const NOW = 1_700_000_000_000;
const ITEM = { productId: 'prd-1', name: '冷媒 R410', thumb: 'https://x/1.png', priceCents: 2500 };

const storeWith = (...items) => ({ items, updatedAt: NOW });
const entryOf = (over = {}) => ({
  customerId: fav.LOCAL_CUSTOMER_ID,
  productId: 'prd-1',
  productSnapshot: { name: '冷媒 R410', image: 'https://x/1.png', priceCents: 2500 },
  createdAt: NOW,
  ...over,
});

test('toSnapshot：只留顯示需要的三個欄位', async (t) => {
  await t.test('名稱／圖／價格（分）', () => {
    assert.deepEqual(fav.toSnapshot(ITEM), {
      name: '冷媒 R410',
      image: 'https://x/1.png',
      priceCents: 2500,
    });
  });

  await t.test('缺圖給空字串、價格不是整數給 0（不留下 undefined）', () => {
    assert.deepEqual(fav.toSnapshot({ name: 'x' }), { name: 'x', image: '', priceCents: 0 });
  });

  await t.test('null → null', () => {
    assert.equal(fav.toSnapshot(null), null);
  });
});

test('addFavorite／removeFavorite／isFavorite', async (t) => {
  await t.test('加入後 isFavorite 為 true，且紀錄帶佔位符 customerId', () => {
    const r = fav.addFavorite(fav.createStore(), { productId: 'prd-1', item: ITEM, now: NOW });
    assert.equal(r.ok, true);
    assert.equal(r.added, true);
    assert.equal(r.store.items.length, 1);
    assert.equal(r.store.items[0].customerId, fav.LOCAL_CUSTOMER_ID);
    assert.equal(r.store.items[0].createdAt, NOW);
    assert.equal(fav.isFavorite(r.store, 'prd-1'), true);
  });

  await t.test('⚠️ 重複加入不新增，且**不更新快照**（快照是第一次收藏當下的值）', () => {
    const first = fav.addFavorite(fav.createStore(), { productId: 'prd-1', item: ITEM, now: NOW }).store;
    const second = fav.addFavorite(first, {
      productId: 'prd-1',
      item: { ...ITEM, priceCents: 9900, name: '改名了' },
      now: NOW + 1000,
    });
    assert.equal(second.ok, true);
    assert.equal(second.added, false);
    assert.equal(second.store.items.length, 1);
    assert.equal(second.store.items[0].productSnapshot.priceCents, 2500, '價格仍是第一次收藏的');
    assert.equal(second.store.items[0].productSnapshot.name, '冷媒 R410');
  });

  await t.test('移除後 isFavorite 為 false', () => {
    const added = fav.addFavorite(fav.createStore(), { productId: 'prd-1', item: ITEM, now: NOW }).store;
    const removed = fav.removeFavorite(added, 'prd-1', NOW + 1);
    assert.equal(removed.ok, true);
    assert.equal(removed.removed, true);
    assert.equal(fav.isFavorite(removed.store, 'prd-1'), false);
  });

  await t.test('移除不在清單裡的 → NOT_FOUND', () => {
    const r = fav.removeFavorite(fav.createStore(), 'prd-999', NOW);
    assert.equal(r.ok, false);
    assert.equal(r.code, fav.FavoriteCode.NOT_FOUND);
  });

  await t.test('缺 productId／缺 item → INVALID（不寫入半成品）', () => {
    assert.equal(fav.addFavorite(fav.createStore(), { item: ITEM, now: NOW }).code, fav.FavoriteCode.INVALID);
    assert.equal(fav.addFavorite(fav.createStore(), { productId: 'prd-1', now: NOW }).code, fav.FavoriteCode.INVALID);
  });

  await t.test('達上限 → LIMIT_EXCEEDED（本機版的保護；後端版不需要）', () => {
    const full = { items: Array.from({ length: fav.MAX_FAVORITES }, (_, i) => entryOf({ productId: `p${i}` })), updatedAt: NOW };
    const r = fav.addFavorite(full, { productId: 'new', item: ITEM, now: NOW });
    assert.equal(r.ok, false);
    assert.equal(r.code, fav.FavoriteCode.LIMIT_EXCEEDED);
  });

  await t.test('原 store 不會被改到（純函式）', () => {
    const before = fav.createStore();
    fav.addFavorite(before, { productId: 'prd-1', item: ITEM, now: NOW });
    assert.equal(before.items.length, 0);
  });
});

test('toggleFavorite：詳情頁按鈕用這支', async (t) => {
  await t.test('未收藏 → 收藏，favorited 為 true', () => {
    const r = fav.toggleFavorite(fav.createStore(), { productId: 'prd-1', item: ITEM, now: NOW });
    assert.equal(r.favorited, true);
    assert.equal(r.store.items.length, 1);
  });

  await t.test('已收藏 → 取消，favorited 為 false', () => {
    const first = fav.toggleFavorite(fav.createStore(), { productId: 'prd-1', item: ITEM, now: NOW }).store;
    const second = fav.toggleFavorite(first, { productId: 'prd-1', item: ITEM, now: NOW + 1 });
    assert.equal(second.favorited, false);
    assert.equal(second.store.items.length, 0);
  });

  await t.test('來回切換兩次回到原狀', () => {
    let store = fav.createStore();
    store = fav.toggleFavorite(store, { productId: 'prd-1', item: ITEM, now: NOW }).store;
    store = fav.toggleFavorite(store, { productId: 'prd-1', item: ITEM, now: NOW }).store;
    assert.equal(store.items.length, 0);
  });

  await t.test('缺 productId → favorited 為 false', () => {
    assert.equal(fav.toggleFavorite(fav.createStore(), {}).favorited, false);
  });
});

test('listFavorites：回傳複本（呼叫端改不到內部）', async (t) => {
  await t.test('內容正確，且改回傳值不影響原 store', () => {
    const store = fav.addFavorite(fav.createStore(), { productId: 'prd-1', item: ITEM, now: NOW }).store;
    const list = fav.listFavorites(store);
    assert.equal(list.length, 1);
    list[0].productSnapshot.priceCents = 9999;
    assert.equal(store.items[0].productSnapshot.priceCents, 2500);
  });

  await t.test('空資料不爆', () => {
    assert.deepEqual(fav.listFavorites(null), []);
    assert.deepEqual(fav.listFavorites({}), []);
  });
});

/**
 * Storage 是唯一會碰外部狀態的邊界 —— 與 `cart.normalizeCart` 同一套原則。
 */
test('normalizeStore：Storage 內容的容錯（單筆壞掉不毀整份）', async (t) => {
  const wrap = (items) => JSON.stringify({ items, updatedAt: NOW });

  await t.test('正常內容原樣通過（並補回缺漏的可選欄位）', () => {
    const s = fav.normalizeStore(wrap([entryOf({ customerId: undefined, createdAt: undefined })]));
    assert.equal(s.items.length, 1);
    assert.equal(s.items[0].customerId, fav.LOCAL_CUSTOMER_ID, '缺 customerId 補佔位符');
    assert.equal(s.items[0].createdAt, null);
    assert.equal(s.updatedAt, NOW);
  });

  await t.test('無法解析／形狀不對 → 空資料（不拋錯）', () => {
    assert.deepEqual(fav.normalizeStore('{壞掉'), fav.createStore());
    assert.deepEqual(fav.normalizeStore(null), fav.createStore());
    assert.deepEqual(fav.normalizeStore({ items: 'x' }), fav.createStore());
  });

  await t.test('⚠️ 單筆壞掉只丟那一筆', () => {
    const s = fav.normalizeStore(
      wrap([
        entryOf({ productId: 'ok' }),
        entryOf({ productId: 'no-snapshot', productSnapshot: null }),
        entryOf({ productId: 'bad-price', productSnapshot: { name: 'x', priceCents: '2500' } }),
        entryOf({ productId: 'no-id', productId2: 1, productId: undefined }),
        entryOf({ productId: 'ok-2' }),
      ]),
    );
    assert.deepEqual(s.items.map((e) => e.productId), ['ok', 'ok-2']);
  });

  await t.test('⚠️ 重複的 productId 只留第一筆（與後端的唯一索引語意一致）', () => {
    const s = fav.normalizeStore(wrap([entryOf({ createdAt: 1 }), entryOf({ createdAt: 2 })]));
    assert.equal(s.items.length, 1);
    assert.equal(s.items[0].createdAt, 1);
  });

  await t.test('超過上限時截斷（不讓本機資料無限成長）', () => {
    const many = Array.from({ length: fav.MAX_FAVORITES + 10 }, (_, i) => entryOf({ productId: `p${i}` }));
    assert.equal(fav.normalizeStore(wrap(many)).items.length, fav.MAX_FAVORITES);
  });

  await t.test('缺圖 → 空字串（不是 undefined）', () => {
    const s = fav.normalizeStore(wrap([entryOf({ productSnapshot: { name: 'x', priceCents: 100 } })]));
    assert.equal(s.items[0].productSnapshot.image, '');
  });
});

/**
 * ⚠️ 這一組是「提醒測試」：把 P7a 的臨時方案寫成可被看見的事實。
 * P5 接上後端後，這裡的斷言應該改成「customerId 由後端決定」。
 */
test('⚠️ P7a 的臨時方案（P5 必須改）', async (t) => {
  await t.test('本機寫入的 customerId 是佔位符，不是真實 openid', () => {
    assert.equal(fav.LOCAL_CUSTOMER_ID, '__local__');
    const r = fav.addFavorite(fav.createStore(), { productId: 'prd-1', item: ITEM, now: NOW });
    assert.equal(r.store.items[0].customerId, fav.LOCAL_CUSTOMER_ID);
  });

  await t.test('Storage key 有版本號（未來改 schema 時可辨識舊資料）', () => {
    assert.equal(fav.STORAGE_KEY, 'repair.favorites.v1');
  });
});
