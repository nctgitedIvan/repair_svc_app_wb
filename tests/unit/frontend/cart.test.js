'use strict';

/**
 * 購物車純函式測試。
 *
 * 涵蓋 §3.7.6 的四種邊界情況，以及 §3.7.2 的核心規則
 * （服務永遠不得進購物車）。
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const cart = require('../../../utils/cart');
const { CartCode, MAX_CART_LINES, MAX_LINE_QUANTITY } = require('../../../utils/cartCodes');

const NOW = 1_700_000_000_000;

const product = (over = {}) => ({
  itemType: 'product',
  productId: 'prd-1',
  specId: null,
  quantity: 1,
  priceCents: 2500,
  ...over,
});

test('⚠️ 核心規則：服務永遠不得進購物車（§3.7.2）', async (t) => {
  await t.test('itemType = service → 拒絕', () => {
    const r = cart.addItem(cart.createCart(), product({ itemType: 'service' }), NOW);
    assert.equal(r.ok, false);
    assert.equal(r.code, CartCode.SERVICE_NOT_CARTABLE);
  });

  await t.test('缺少 itemType 或為其他值 → 拒絕', () => {
    assert.equal(cart.addItem(cart.createCart(), product({ itemType: undefined }), NOW).code, CartCode.SERVICE_NOT_CARTABLE);
    assert.equal(cart.addItem(cart.createCart(), product({ itemType: 'bundle' }), NOW).code, CartCode.SERVICE_NOT_CARTABLE);
  });

  await t.test('⚠️ 拒絕後購物車不變（不會留下半成品）', () => {
    const before = cart.createCart();
    const r = cart.addItem(before, product({ itemType: 'service' }), NOW);
    assert.equal(r.cart.items.length, 0);
  });

  await t.test('商品正常加入', () => {
    const r = cart.addItem(cart.createCart(), product(), NOW);
    assert.equal(r.ok, true);
    assert.equal(r.cart.items.length, 1);
    assert.equal(r.cart.items[0].quantity, 1);
    assert.equal(r.cart.items[0].addedPriceCents, 2500);
  });
});

test('加入、合併、數量', async (t) => {
  await t.test('同商品同規格 → 合併數量', () => {
    let c = cart.addItem(cart.createCart(), product({ quantity: 2 }), NOW).cart;
    c = cart.addItem(c, product({ quantity: 3 }), NOW).cart;
    assert.equal(c.items.length, 1);
    assert.equal(c.items[0].quantity, 5);
  });

  await t.test('同商品不同規格 → 兩筆明細', () => {
    let c = cart.addItem(cart.createCart(), product({ specId: 'red' }), NOW).cart;
    c = cart.addItem(c, product({ specId: 'blue' }), NOW).cart;
    assert.equal(c.items.length, 2);
  });

  await t.test('⚠️ 合併時保留最初的 addedPriceCents（不因再次加入而改價）', () => {
    let c = cart.addItem(cart.createCart(), product({ priceCents: 2500 }), NOW).cart;
    c = cart.addItem(c, product({ priceCents: 3000 }), NOW).cart;
    assert.equal(c.items[0].addedPriceCents, 2500, '價格承諾以最初加入時為準');
  });

  await t.test('數量必須是正整數', () => {
    assert.equal(cart.addItem(cart.createCart(), product({ quantity: 0 }), NOW).code, CartCode.INVALID_QUANTITY);
    assert.equal(cart.addItem(cart.createCart(), product({ quantity: -1 }), NOW).code, CartCode.INVALID_QUANTITY);
    assert.equal(cart.addItem(cart.createCart(), product({ quantity: 1.5 }), NOW).code, CartCode.INVALID_QUANTITY);
    assert.equal(cart.addItem(cart.createCart(), product({ quantity: MAX_LINE_QUANTITY + 1 }), NOW).code, CartCode.INVALID_QUANTITY);
  });

  await t.test('updateQuantity：改數量 / 設 0 等於移除', () => {
    let c = cart.addItem(cart.createCart(), product(), NOW).cart;
    const lineId = c.items[0].lineId;

    c = cart.updateQuantity(c, lineId, 7, NOW).cart;
    assert.equal(c.items[0].quantity, 7);

    c = cart.updateQuantity(c, lineId, 0, NOW).cart;
    assert.equal(c.items.length, 0);
  });

  await t.test('removeLine / clear', () => {
    let c = cart.addItem(cart.createCart(), product(), NOW).cart;
    assert.equal(cart.removeLine(c, 'nope', NOW).ok, false);
    assert.equal(cart.removeLine(c, c.items[0].lineId, NOW).cart.items.length, 0);
    assert.equal(cart.clear(NOW).items.length, 0);
  });

  await t.test('⚠️ 純函式：不修改傳入的 cart', () => {
    const before = cart.addItem(cart.createCart(), product(), NOW).cart;
    const snapshot = JSON.stringify(before);
    cart.addItem(before, product({ quantity: 5 }), NOW);
    cart.updateQuantity(before, before.items[0].lineId, 9, NOW);
    assert.equal(JSON.stringify(before), snapshot);
  });
});

test('⚠️ 邊界 1：購物車上限 50 項（§3.7.6）', async (t) => {
  await t.test('第 51 項被拒', () => {
    let c = cart.createCart();
    for (let i = 0; i < MAX_CART_LINES; i++) {
      c = cart.addItem(c, product({ productId: `prd-${i}` }), NOW).cart;
    }
    assert.equal(c.items.length, MAX_CART_LINES);

    const r = cart.addItem(c, product({ productId: 'prd-overflow' }), NOW);
    assert.equal(r.ok, false);
    assert.equal(r.code, CartCode.LIMIT_EXCEEDED);
    assert.equal(r.limit, MAX_CART_LINES);
  });

  await t.test('⚠️ 已存在的商品仍可加量（上限只算項數，不算數量）', () => {
    let c = cart.createCart();
    for (let i = 0; i < MAX_CART_LINES; i++) {
      c = cart.addItem(c, product({ productId: `prd-${i}` }), NOW).cart;
    }
    assert.equal(cart.addItem(c, product({ productId: 'prd-0' }), NOW).ok, true);
  });
});

test('⚠️ 結算前檢查（§3.7.6）', async (t) => {
  const buildCart = () => {
    let c = cart.createCart();
    c = cart.addItem(c, product({ productId: 'p1', quantity: 2 }), NOW).cart;
    c = cart.addItem(c, product({ productId: 'p2' }), NOW).cart;
    return c;
  };
  const catalog = (over = {}) => ({
    p1: { isActive: true, stock: 10, priceCents: 2500 },
    p2: { isActive: true, stock: 10, priceCents: 2500 },
    ...over,
  });

  await t.test('一切正常 → ok', () => {
    const r = cart.validate(buildCart(), catalog());
    assert.equal(r.ok, true);
    assert.deepEqual(r.issues, []);
  });

  await t.test('邊界 2：庫存不足 → OUT_OF_STOCK 且阻擋結算', () => {
    const r = cart.validate(buildCart(), catalog({ p1: { isActive: true, stock: 1, priceCents: 2500 } }));
    assert.equal(r.ok, false);
    assert.equal(r.blocking[0].code, CartCode.OUT_OF_STOCK);
    assert.equal(r.blocking[0].detail.requested, 2);
    assert.equal(r.blocking[0].detail.stock, 1);
  });

  await t.test('邊界 3：商品下架 → DELISTED 且阻擋結算', () => {
    const r = cart.validate(buildCart(), catalog({ p2: { isActive: false, stock: 10, priceCents: 2500 } }));
    assert.equal(r.ok, false);
    assert.equal(r.issues[0].code, CartCode.DELISTED);
  });

  await t.test('商品不存在 → PRODUCT_NOT_FOUND 且阻擋', () => {
    const c = catalog();
    delete c.p2;
    const r = cart.validate(buildCart(), c);
    assert.equal(r.ok, false);
    assert.equal(r.issues[0].code, CartCode.PRODUCT_NOT_FOUND);
  });

  await t.test('⚠️ 邊界 4：價格變動 → PRICE_CHANGED，但**不阻擋結算**', () => {
    const r = cart.validate(buildCart(), catalog({ p1: { isActive: true, stock: 10, priceCents: 3000 } }));
    assert.equal(r.ok, true, '價格變動只提示，由使用者決定');
    assert.equal(r.issues[0].code, CartCode.PRICE_CHANGED);
    assert.equal(r.issues[0].detail.addedPriceCents, 2500);
    assert.equal(r.issues[0].detail.currentPriceCents, 3000);
    assert.equal(r.blocking.length, 0);
  });

  await t.test('多個問題同時回報（不是遇到第一個就停）', () => {
    const r = cart.validate(
      buildCart(),
      catalog({
        p1: { isActive: true, stock: 1, priceCents: 2500 },
        p2: { isActive: false, stock: 10, priceCents: 2500 },
      }),
    );
    assert.equal(r.issues.length, 2);
    assert.equal(r.blocking.length, 2);
  });

  await t.test('空車 → 沒有問題', () => {
    assert.equal(cart.validate(cart.createCart(), {}).ok, true);
  });
});

test('金額與數量', async (t) => {
  const build = () => {
    let c = cart.createCart();
    c = cart.addItem(c, product({ productId: 'p1', priceCents: 2500, quantity: 2 }), NOW).cart;
    c = cart.addItem(c, product({ productId: 'p2', priceCents: 800, quantity: 3 }), NOW).cart;
    return c;
  };

  await t.test('totalCents 用**加入時價格**計算', () => {
    assert.equal(cart.totalCents(build()), 2500 * 2 + 800 * 3);
  });

  await t.test('totalQuantity', () => {
    assert.equal(cart.totalQuantity(build()), 5);
  });

  await t.test('空車為 0', () => {
    assert.equal(cart.totalCents(cart.createCart()), 0);
    assert.equal(cart.totalQuantity(cart.createCart()), 0);
    assert.equal(cart.isEmpty(cart.createCart()), true);
  });

  await t.test('非購物車物件不爆', () => {
    assert.equal(cart.totalCents(null), 0);
    assert.equal(cart.totalQuantity(undefined), 0);
  });
});

test('結算 payload（docs/01 §3.8 契約）', async (t) => {
  await t.test('帶出 source／orderType／items／expectedTotalCents／cartLineIds', () => {
    let c = cart.addItem(cart.createCart(), product({ quantity: 2 }), NOW).cart;
    const payload = cart.toCheckoutPayload(c, { addressId: 'addr-1', appointmentAt: 123 });

    assert.equal(payload.source, 'cart');
    assert.equal(payload.orderType, 'product');
    assert.equal(payload.addressId, 'addr-1');
    assert.equal(payload.appointmentAt, 123);
    assert.equal(payload.expectedTotalCents, 5000);
    assert.deepEqual(payload.cartLineIds, ['prd-1']);
    assert.deepEqual(payload.items, [
      { itemType: 'product', itemId: 'prd-1', skuId: null, quantity: 2 },
    ]);
  });

  await t.test('⚠️ 有規格時 skuId 取 line 的 specId（本機存的是 skuId）', () => {
    const c = cart.addItem(cart.createCart(), product({ specId: 'sku-big', quantity: 1, priceCents: 4800 }), NOW).cart;
    const payload = cart.toCheckoutPayload(c);
    assert.equal(payload.items[0].skuId, 'sku-big');
    assert.equal(payload.expectedTotalCents, 4800);
    assert.deepEqual(payload.cartLineIds, ['prd-1:sku-big']);
  });

  await t.test('⚠️ 空購物車也能產生 payload（由後端拒絕，前端不自行判斷可否下單）', () => {
    const payload = cart.toCheckoutPayload(cart.createCart(), { addressId: 'a' });
    assert.deepEqual(payload.items, []);
    assert.deepEqual(payload.cartLineIds, []);
    assert.equal(payload.expectedTotalCents, 0);
  });
});

test('⚠️ schema 必須與後端一致（Q-D：讓 P7b 遷移無痛）', async (t) => {
  await t.test('明細欄位固定，不多不少', () => {
    const c = cart.addItem(cart.createCart(), product(), NOW).cart;
    assert.deepEqual(
      Object.keys(c.items[0]).sort(),
      ['addedAt', 'addedPriceCents', 'currency', 'lineId', 'productId', 'quantity', 'specId'],
    );
  });

  await t.test('lineId 的產生規則穩定（productId 或 productId:specId）', () => {
    assert.equal(cart.lineIdOf('p1', null), 'p1');
    assert.equal(cart.lineIdOf('p1', 'red'), 'p1:red');
  });

  await t.test('currency 有預設值（不依賴前端推斷）', () => {
    const c = cart.addItem(cart.createCart(), product(), NOW).cart;
    assert.equal(c.items[0].currency, 'CNY');
  });
});

/**
 * Storage 是唯一會接觸「外部狀態」的邊界 —— 內容可能損毀、可能是舊版寫的。
 * `loadCart()` 碰 `wx` 無法在 Node 測試，因此把解析與修補抽成 `normalizeCart()`。
 *
 * 原則：**單筆壞掉不該毀掉整車**。
 */
test('normalizeCart：Storage 內容的容錯（單筆壞掉不毀整車）', async (t) => {
  const stored = (over = {}) => ({
    lineId: 'prd-1',
    productId: 'prd-1',
    specId: null,
    quantity: 2,
    addedPriceCents: 2500,
    currency: 'CNY',
    addedAt: NOW,
    ...over,
  });
  const wrap = (items, updatedAt = NOW) => JSON.stringify({ items, updatedAt });

  await t.test('正常內容原樣通過', () => {
    const c = cart.normalizeCart(wrap([stored()]));
    assert.equal(c.items.length, 1);
    assert.equal(c.items[0].quantity, 2);
    assert.equal(c.updatedAt, NOW);
  });

  await t.test('物件與字串都能接受（getStorageSync 兩種都可能回）', () => {
    assert.equal(cart.normalizeCart({ items: [stored()] }).items.length, 1);
    assert.equal(cart.normalizeCart(wrap([stored()])).items.length, 1);
  });

  await t.test('無法解析的字串 → 空車（不拋錯）', () => {
    assert.deepEqual(cart.normalizeCart('{壞掉的字串'), cart.createCart());
    assert.deepEqual(cart.normalizeCart('null'), cart.createCart());
  });

  await t.test('形狀不對（null／缺 items／items 不是陣列）→ 空車', () => {
    assert.deepEqual(cart.normalizeCart(null), cart.createCart());
    assert.deepEqual(cart.normalizeCart(undefined), cart.createCart());
    assert.deepEqual(cart.normalizeCart({}), cart.createCart());
    assert.deepEqual(cart.normalizeCart({ items: 'not-an-array' }), cart.createCart());
  });

  await t.test('⚠️ 單筆壞掉只丟那一筆，其餘保留', () => {
    const c = cart.normalizeCart(
      wrap([
        stored({ lineId: 'ok' }),
        stored({ lineId: 'bad-no-product', productId: undefined }),
        stored({ lineId: 'bad-qty', quantity: 0 }),
        stored({ lineId: 'bad-float', quantity: 1.5 }),
        stored({ lineId: 'bad-price', addedPriceCents: -1 }),
        stored({ lineId: 'ok-2', productId: 'prd-2' }),
      ]),
    );
    assert.deepEqual(
      c.items.map((i) => i.lineId),
      ['ok', 'ok-2'],
    );
  });

  await t.test('數量超過上限 → 夾到上限（不丟掉使用者的東西）', () => {
    const c = cart.normalizeCart(wrap([stored({ quantity: MAX_LINE_QUANTITY + 500 })]));
    assert.equal(c.items[0].quantity, MAX_LINE_QUANTITY);
  });

  await t.test('⚠️ 重複的 lineId 只留第一筆（否則改一筆會動到兩筆）', () => {
    const c = cart.normalizeCart(wrap([stored({ quantity: 1 }), stored({ quantity: 9 })]));
    assert.equal(c.items.length, 1);
    assert.equal(c.items[0].quantity, 1);
  });

  await t.test('缺 currency / addedAt 時補上安全預設', () => {
    const c = cart.normalizeCart(wrap([stored({ currency: undefined, addedAt: undefined })]));
    assert.equal(c.items[0].currency, 'CNY');
    assert.equal(c.items[0].addedAt, null);
  });

  await t.test('specId 缺漏補 null（不是 undefined，維持欄位形狀一致）', () => {
    const c = cart.normalizeCart(wrap([stored({ specId: undefined })]));
    assert.equal(c.items[0].specId, null);
  });

  await t.test('updatedAt 不是整數 → null', () => {
    assert.equal(cart.normalizeCart(wrap([stored()], 'oops')).updatedAt, null);
  });
});
