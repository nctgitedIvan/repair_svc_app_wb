'use strict';

/**
 * 購物車畫面組裝的測試。
 *
 * 這一層是「規則 → 畫面」的翻譯，因此測試的重點是：
 *   1. 分組正確（哪些進正常區、哪些進失效區）
 *   2. 金額與件數**與 cart.js 一致**（不重新定義規則）
 *   3. 勾選狀態的保留規則（§4.3 的四條）
 *   4. 相容橋接的欄位齊全（T7 之前的結算頁靠它）
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const cart = require('../../../utils/cart');
const view = require('../../../utils/cartView');
const { CartCode, MAX_LINE_QUANTITY } = require('../../../utils/cartCodes');

const NOW = 1_700_000_000_000;

/** 商品現況（`fetchProducts()` 的形狀） */
// T6a.3：主圖走 images[]；購物車明細的 specId 是 **skuId**（§7.4）
const PRD_1 = { productId: 'prd-1', name: '冷媒 R410', category: '冷媒', priceCents: 2500, stock: 20, isActive: true, images: ['https://x/1.png'], specs: [{ specId: 'size', title: '規格', values: ['標準罐'] }], skus: [{ skuId: 'std', specValues: ['標準罐'], priceCents: 2500, stock: 20 }] };
const PRD_2 = { productId: 'prd-2', name: '排水管接頭', category: '管件', priceCents: 800, stock: 3, isActive: true, images: ['https://x/2.png'], specs: [], skus: [] };
const PRD_3 = { productId: 'prd-3', name: '濾網（通用型）', category: '耗材', priceCents: 450, stock: 0, isActive: true, images: [], specs: [], skus: [] };
const PRD_4 = { productId: 'prd-4', name: '舊款溫控器', category: '零件', priceCents: 3200, stock: 5, isActive: false, images: [], specs: [], skus: [] };

const CATALOG = {
  'prd-1': PRD_1,
  'prd-2': PRD_2,
  'prd-3': PRD_3,
  'prd-4': PRD_4,
};

/** 用 cart.addItem 造購物車，確保測的是真實形狀 */
function cartOf(...specs) {
  return specs.reduce(
    (c, s) =>
      cart.addItem(
        c,
        { itemType: 'product', productId: s.productId, specId: s.specId || null, quantity: s.quantity, priceCents: s.priceCents },
        NOW,
      ).cart,
    cart.createCart(),
  );
}

const ids = (list) => list.map((l) => l.lineId);

test('buildCartView：分組（§3.7.6 的四種邊界情況）', async (t) => {
  await t.test('⚠️ 三種阻擋結算的問題碼進失效區；價格變動留在正常區', () => {
    const c = cartOf(
      { productId: 'prd-1', quantity: 1, priceCents: 2500 }, // 正常
      { productId: 'prd-2', quantity: 5, priceCents: 800 }, // 庫存 3 < 5 → OUT_OF_STOCK
      { productId: 'prd-3', quantity: 1, priceCents: 450 }, // 庫存 0 → OUT_OF_STOCK
      { productId: 'prd-4', quantity: 1, priceCents: 3200 }, // isActive false → DELISTED
      { productId: 'prd-999', quantity: 1, priceCents: 100 }, // 不存在 → PRODUCT_NOT_FOUND
    );
    const v = view.buildCartView({ cart: c, catalog: CATALOG, selectedLineIds: ids(c.items) });

    assert.deepEqual(ids(v.lines), ['prd-1'], '只有 prd-1 是正常項');
    assert.deepEqual(ids(v.invalidLines).sort(), ['prd-2', 'prd-3', 'prd-4', 'prd-999']);

    const codeOf = (v2, lineId) => v2.find((l) => l.lineId === lineId).issueCode;
    assert.equal(codeOf(v.invalidLines, 'prd-2'), CartCode.OUT_OF_STOCK);
    assert.equal(codeOf(v.invalidLines, 'prd-3'), CartCode.OUT_OF_STOCK);
    assert.equal(codeOf(v.invalidLines, 'prd-4'), CartCode.DELISTED);
    assert.equal(codeOf(v.invalidLines, 'prd-999'), CartCode.PRODUCT_NOT_FOUND);
  });

  await t.test('價格變動**不算失效**（只提示，不阻擋結算）', () => {
    const c = cartOf({ productId: 'prd-1', quantity: 1, priceCents: 2000 }); // 加入時 2000，現價 2500
    const v = view.buildCartView({ cart: c, catalog: CATALOG, selectedLineIds: ['prd-1'] });

    assert.equal(v.lines.length, 1);
    assert.equal(v.invalidLines.length, 0);
    assert.equal(v.lines[0].issueCode, CartCode.PRICE_CHANGED);
    assert.equal(v.lines[0].isPriceChanged, true);
    assert.equal(v.hasPriceChange, true);
    assert.equal(v.lines[0].priceCents, 2000, '顯示加入時價格');
    assert.equal(v.lines[0].currentPriceCents, 2500, '另帶現價供結算提示');
  });

  await t.test('已勾選項才有價格變動提示（未勾選的不該擋結算）', () => {
    const c = cartOf({ productId: 'prd-1', quantity: 1, priceCents: 2000 });
    const v = view.buildCartView({ cart: c, catalog: CATALOG, selectedLineIds: [] });
    assert.equal(v.hasPriceChange, false);
    assert.deepEqual(v.priceChangeLines, []);
  });

  await t.test('⚠️ 失效項一律 isSelected = false（即使被列進 selectedLineIds）', () => {
    const c = cartOf({ productId: 'prd-4', quantity: 1, priceCents: 3200 });
    const v = view.buildCartView({ cart: c, catalog: CATALOG, selectedLineIds: ['prd-4'] });
    assert.equal(v.invalidLines[0].isSelected, false);
    assert.equal(v.selectedCount, 0);
  });

  await t.test('空車／catalog 為空都不爆', () => {
    const empty = view.buildCartView({ cart: cart.createCart(), catalog: {}, selectedLineIds: [] });
    assert.deepEqual(empty.lines, []);
    assert.equal(empty.totalCents, 0);
    assert.equal(empty.allSelected, false, '空車不算「全選」（否則會顯示已全選）');

    const noArg = view.buildCartView();
    assert.deepEqual(noArg.lines, []);
  });
});

test('buildCartView：金額與件數**與 cart.js 一致**', async (t) => {
  await t.test('總額 = Σ 加入時價格 × 數量（只算已勾選）', () => {
    const c = cartOf(
      { productId: 'prd-1', quantity: 2, priceCents: 2500 },
      { productId: 'prd-2', quantity: 3, priceCents: 800 },
    );
    const all = view.buildCartView({ cart: c, catalog: CATALOG, selectedLineIds: ['prd-1', 'prd-2'] });
    assert.equal(all.totalCents, 2500 * 2 + 800 * 3);
    assert.equal(all.totalCents, cart.totalCents(c), '與 cart.totalCents 一致');
    assert.equal(all.selectedCount, 5);

    const onlyFirst = view.buildCartView({ cart: c, catalog: CATALOG, selectedLineIds: ['prd-1'] });
    assert.equal(onlyFirst.totalCents, 2500 * 2);
    assert.equal(onlyFirst.selectedCount, 2);
  });

  await t.test('selectedCount 是**件數合計**，不是明細筆數', () => {
    const c = cartOf({ productId: 'prd-1', quantity: 4, priceCents: 2500 });
    const v = view.buildCartView({ cart: c, catalog: CATALOG, selectedLineIds: ['prd-1'] });
    assert.equal(v.lines.length, 1);
    assert.equal(v.selectedCount, 4);
  });

  await t.test('allSelected：全部有效項都勾了才為 true', () => {
    const c = cartOf(
      { productId: 'prd-1', quantity: 1, priceCents: 2500 },
      { productId: 'prd-2', quantity: 1, priceCents: 800 },
    );
    assert.equal(view.buildCartView({ cart: c, catalog: CATALOG, selectedLineIds: ['prd-1', 'prd-2'] }).allSelected, true);
    assert.equal(view.buildCartView({ cart: c, catalog: CATALOG, selectedLineIds: ['prd-1'] }).allSelected, false);
  });

  await t.test('失效項不計入總額（即使它比較貴）', () => {
    const c = cartOf(
      { productId: 'prd-1', quantity: 1, priceCents: 2500 },
      { productId: 'prd-4', quantity: 1, priceCents: 3200 },
    );
    const v = view.buildCartView({ cart: c, catalog: CATALOG, selectedLineIds: ['prd-1', 'prd-4'] });
    assert.equal(v.totalCents, 2500);
  });
});

test('view model 的呈現欄位（配合既有 goods-card）', async (t) => {
  await t.test('名稱／縮圖／規格名／庫存／上限', () => {
    const c = cartOf({ productId: 'prd-1', specId: 'std', quantity: 1, priceCents: 2500 });
    const line = view.buildCartView({ cart: c, catalog: CATALOG, selectedLineIds: ['prd-1:std'] }).lines[0];

    assert.equal(line.lineId, 'prd-1:std');
    assert.equal(line.title, '冷媒 R410');
    assert.equal(line.thumb, 'https://x/1.png');
    assert.deepEqual(line.specs, ['標準罐'], 'goods-card 直接渲染 specs');
    assert.equal(line.stockQuantity, 20);
    assert.equal(line.maxQuantity, 20);
    assert.equal(line.price, 2500, 'goods-card 的 price 元件吃 price');
  });

  await t.test('數量上限受庫存限制', () => {
    const c = cartOf({ productId: 'prd-2', quantity: 1, priceCents: 800 });
    const line = view.buildCartView({ cart: c, catalog: CATALOG, selectedLineIds: ['prd-2'] }).lines[0];
    assert.equal(line.maxQuantity, 3, 'prd-2 庫存 3');
  });

  await t.test('庫存未知（商品現況缺 stock）時上限為 MAX_LINE_QUANTITY', () => {
    const c = cartOf({ productId: 'prd-1', quantity: 1, priceCents: 2500 });
    const catalog = { 'prd-1': { name: '冷媒', isActive: true, priceCents: 2500 } };
    const line = view.buildCartView({ cart: c, catalog, selectedLineIds: ['prd-1'] }).lines[0];
    assert.equal(line.maxQuantity, MAX_LINE_QUANTITY);
  });

  await t.test('⚠️ 商品不存在時 stockQuantity = 0（讓 goods-card 走「已無法購買」分支，而不是誤判庫存不足）', () => {
    const c = cartOf({ productId: 'prd-999', quantity: 1, priceCents: 100 });
    const line = view.buildCartView({ cart: c, catalog: CATALOG, selectedLineIds: [] }).invalidLines[0];
    assert.equal(line.stockQuantity, 0);
    assert.equal(line.title, '（商品已不存在）');
    assert.equal(line.issueText, '商品已不存在');
  });

  await t.test('問題碼有中文說明（畫面直接顯示）', () => {
    const c = cartOf({ productId: 'prd-3', quantity: 1, priceCents: 450 });
    const line = view.buildCartView({ cart: c, catalog: CATALOG, selectedLineIds: [] }).invalidLines[0];
    assert.equal(line.issueText, '已售完');
  });

  await t.test('⚠️ 遮罩要短的（128rpx 圓形塞不下「商品已不存在」）', () => {
    const mk = (productId, priceCents) => {
      const c = cartOf({ productId, quantity: 1, priceCents });
      return view.buildCartView({ cart: c, catalog: CATALOG, selectedLineIds: [] }).invalidLines[0];
    };
    assert.equal(mk('prd-3', 450).issueShortText, '已售完');
    assert.equal(mk('prd-4', 3200).issueShortText, '已下架');
    assert.equal(mk('prd-999', 100).issueShortText, '已失效', '長句要縮短');
    assert.equal(mk('prd-999', 100).issueText, '商品已不存在', '完整說明仍保留');
    for (const line of [mk('prd-3', 450), mk('prd-4', 3200), mk('prd-999', 100)]) {
      assert.ok(line.issueShortText.length <= 3, '短文字不得超過 3 個字：' + line.issueShortText);
    }
  });

  await t.test('價格變動提供「現價」的文字形式（WXML 沒有數字格式化）', () => {
    const c = cartOf({ productId: 'prd-1', quantity: 1, priceCents: 2000 });
    const line = view.buildCartView({ cart: c, catalog: CATALOG, selectedLineIds: ['prd-1'] }).lines[0];
    assert.equal(line.currentPriceCents, 2500);
    assert.equal(line.currentPriceText, '25.00');
    assert.equal(line.priceCents, 2000, '主價格仍是加入時的價格');
  });

  await t.test('⚠️ 商品不存在時現價字串為空（否則畫面會出現 "¥NaN"）', () => {
    const c = cartOf({ productId: 'prd-999', quantity: 1, priceCents: 100 });
    const line = view.buildCartView({ cart: c, catalog: CATALOG, selectedLineIds: [] }).invalidLines[0];
    assert.equal(line.currentPriceCents, null);
    assert.equal(line.currentPriceText, '');
  });

  await t.test('價格沒變時 currentPriceText 仍帶現價（顯示與否由 WXML 依 isPriceChanged 決定）', () => {
    const c = cartOf({ productId: 'prd-1', quantity: 1, priceCents: 2500 });
    const line = view.buildCartView({ cart: c, catalog: CATALOG, selectedLineIds: ['prd-1'] }).lines[0];
    assert.equal(line.isPriceChanged, false);
    assert.equal(line.currentPriceText, '25.00');
  });

  await t.test('formatCents：分 → 字串', () => {
    assert.equal(view.formatCents(2500), '25.00');
    assert.equal(view.formatCents(800), '8.00');
    assert.equal(view.formatCents(5), '0.05');
    assert.equal(view.formatCents(0), '0.00');
    assert.equal(view.formatCents(undefined), '', '非整數給空字串（避免顯示 NaN）');
    assert.equal(view.formatCents(1.5), '');
  });

  await t.test('電商欄位被明確關掉（避免殘留的划线价／件數跑出來）', () => {
    const c = cartOf({ productId: 'prd-1', quantity: 1, priceCents: 2500 });
    const line = view.buildCartView({ cart: c, catalog: CATALOG, selectedLineIds: ['prd-1'] }).lines[0];
    assert.equal(line.hideKey.originPrice, true);
    assert.equal(line.hideKey.num, true);
  });
});

test('reconcileSelection：勾選狀態的保留規則（§4.3）', async (t) => {
  const lines = [{ lineId: 'a' }, { lineId: 'b' }, { lineId: 'c' }];

  await t.test('首次進入（上一輪為空）→ 全部勾選', () => {
    const r = view.reconcileSelection({}, lines);
    assert.deepEqual(r.selectedLineIds, ['a', 'b', 'c']);
  });

  await t.test('上一輪為 undefined → 全部勾選', () => {
    assert.deepEqual(view.reconcileSelection(undefined, lines).selectedLineIds, ['a', 'b', 'c']);
  });

  await t.test('⚠️ 使用者刻意取消的項目**不會**被重新勾上', () => {
    const r = view.reconcileSelection({ a: true, b: false, c: true }, lines);
    assert.deepEqual(r.selectedLineIds, ['a', 'c']);
  });

  await t.test('⚠️ 新出現的項目預設勾選（避免加入商品後結算漏掉它）', () => {
    const r = view.reconcileSelection({ a: true, b: false }, lines);
    assert.deepEqual(r.selectedLineIds, ['a', 'c']);
  });

  await t.test('已移除的明細不會留在結果裡', () => {
    const r = view.reconcileSelection({ a: true, b: true, c: true }, [{ lineId: 'a' }]);
    assert.deepEqual(r.selectedLineIds, ['a']);
    assert.deepEqual(Object.keys(r.selectionByLineId), ['a']);
  });

  await t.test('全部取消勾選 → 空陣列（不會因為「沒見過」而復活）', () => {
    const r = view.reconcileSelection({ a: false, b: false, c: false }, lines);
    assert.deepEqual(r.selectedLineIds, []);
  });

  await t.test('回傳的 map 可再餵回自己（連續重整穩定）', () => {
    const first = view.reconcileSelection({ a: true, b: false }, lines);
    const second = view.reconcileSelection(first.selectionByLineId, lines);
    assert.deepEqual(second.selectedLineIds, first.selectedLineIds);
  });
});

/**
 * ⚠️ 這組測試保護的是**過渡期的正確性**：
 * T7 改寫結算頁之前，它仍讀舊格式。橋接欄位少一個就會顯示成空白。
 * T7 刪掉橋接時，這組測試也必須一起刪（計畫 §14 已列為必辦）。
 */
test('toLegacyGoodsRequest：相容橋接（T7 必須移除）', async (t) => {
  const c = cartOf({ productId: 'prd-1', specId: 'std', quantity: 2, priceCents: 2500 });
  const v = view.buildCartView({ cart: c, catalog: CATALOG, selectedLineIds: ['prd-1:std'] });
  const legacy = view.toLegacyGoodsRequest(v.lines);

  await t.test('舊結算頁讀的欄位一個都不少', () => {
    const g = legacy[0];
    for (const key of ['storeId', 'storeName', 'spuId', 'skuId', 'title', 'primaryImage', 'quantity', 'price', 'specInfo']) {
      assert.ok(key in g, `缺少欄位 ${key}（舊結算頁會顯示空白）`);
    }
  });

  await t.test('值對應正確（price 是「分」的字串）', () => {
    const g = legacy[0];
    assert.equal(g.storeId, view.LEGACY_STORE_ID);
    assert.equal(g.storeName, view.LEGACY_STORE_NAME);
    assert.equal(g.spuId, 'prd-1');
    assert.equal(g.skuId, 'std');
    assert.equal(g.title, '冷媒 R410');
    assert.equal(g.primaryImage, 'https://x/1.png');
    assert.equal(g.quantity, 2);
    assert.equal(g.price, '2500');
    assert.deepEqual(g.specInfo, [{ specValue: '標準罐' }]);
  });

  await t.test('沒有規格時 skuId 給 default、specInfo 給空陣列', () => {
    const c2 = cartOf({ productId: 'prd-2', quantity: 1, priceCents: 800 });
    const v2 = view.buildCartView({ cart: c2, catalog: CATALOG, selectedLineIds: ['prd-2'] });
    const g = view.toLegacyGoodsRequest(v2.lines)[0];
    assert.equal(g.skuId, 'default');
    assert.deepEqual(g.specInfo, []);
  });

  await t.test('空陣列不爆', () => {
    assert.deepEqual(view.toLegacyGoodsRequest([]), []);
    assert.deepEqual(view.toLegacyGoodsRequest(), []);
  });
});
