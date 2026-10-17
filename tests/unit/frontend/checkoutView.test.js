'use strict';

/**
 * 結算頁純函式（T7）的測試。
 *
 * 重點：
 *   1. §3.8 契約的形狀驗證
 *   2. 商品／SKU／服務的現價與規格文字
 *   3. 材料費、服務費、商品總額、合計
 *   4. 失效列（商品／服務／SKU 不存在、缺 skuId）
 *   5. 價格變動與 orderType 不一致
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const checkout = require('../../../utils/checkoutView');
const { PRODUCTS, SERVICES } = require('../../../services/api/_fake/data');

const PRODUCT = {
  productId: 'prd-1',
  name: '冷媒 R410',
  priceCents: 2500,
  images: ['p1.png'],
  specs: [{ specId: 'size', title: '規格', values: ['標準罐', '大罐'] }],
  skus: [
    { skuId: 'sku-std', specValues: ['標準罐'], priceCents: 2500, stock: 20, image: 'std.png' },
    { skuId: 'sku-big', specValues: ['大罐'], priceCents: 4800, stock: 8, image: 'big.png' },
  ],
};

const SIMPLE = {
  productId: 'prd-2',
  name: '排水管接頭',
  priceCents: 800,
  images: ['p2.png'],
  specs: [],
  skus: [],
};

const SERVICE = {
  serviceId: 'svc-1',
  name: '冷氣維修',
  priceCents: 10000,
  images: ['s1.png'],
};

const item = (over = {}) => ({ itemType: 'product', itemId: 'prd-2', quantity: 1, ...over });

const payload = (items, over = {}) => ({
  orderType: checkout.orderTypeOf(items),
  items,
  expectedTotalCents: 0,
  ...over,
});

const build = (p, extra = {}) =>
  checkout.buildCheckoutView({
    payload: p,
    products: [PRODUCT, SIMPLE],
    services: [SERVICE],
    ...extra,
  });

test('CHECKOUT_KEY：與購物車共用同一個結算 key', () => {
  assert.equal(checkout.CHECKOUT_KEY, 'repair.checkout.v1');
});

test('orderTypeOf：由明細推導訂單型別', async (t) => {
  await t.test('全商品／全服務／混合', () => {
    assert.equal(checkout.orderTypeOf([item()]), 'product');
    assert.equal(checkout.orderTypeOf([item({ itemType: 'service', itemId: 'svc-1' })]), 'service');
    assert.equal(
      checkout.orderTypeOf([item(), item({ itemType: 'service', itemId: 'svc-1' })]),
      'mixed',
    );
  });

  await t.test('空陣列回 product（實際由 validatePayload 擋下）', () => {
    assert.equal(checkout.orderTypeOf([]), 'product');
    assert.equal(checkout.orderTypeOf(), 'product');
  });
});

test('validatePayload：§3.8 的形狀驗證', async (t) => {
  await t.test('合法 payload', () => {
    assert.deepEqual(checkout.validatePayload(payload([item({ quantity: 2 })])), {
      ok: true,
      errors: [],
    });
  });

  await t.test('空／非物件', () => {
    assert.equal(checkout.validatePayload(null).ok, false);
    assert.deepEqual(checkout.validatePayload(null).errors, ['INVALID_PAYLOAD']);
  });

  await t.test('orderType 不合法', () => {
    const r = checkout.validatePayload(payload([item()], { orderType: 'weird' }));
    assert.ok(r.errors.includes('INVALID_ORDER_TYPE'));
  });

  await t.test('items 空', () => {
    const r = checkout.validatePayload({ orderType: 'product', items: [], expectedTotalCents: 0 });
    assert.ok(r.errors.includes('EMPTY_ITEMS'));
  });

  await t.test('expectedTotalCents 不是非負整數', () => {
    assert.ok(
      checkout
        .validatePayload(payload([item()], { expectedTotalCents: -1 }))
        .errors.includes('INVALID_EXPECTED_TOTAL'),
    );
    assert.ok(
      checkout
        .validatePayload(payload([item()], { expectedTotalCents: '0' }))
        .errors.includes('INVALID_EXPECTED_TOTAL'),
    );
  });

  await t.test('itemType／itemId／quantity 不合法', () => {
    const r = checkout.validatePayload(
      payload([{ itemType: 'bundle', itemId: '', quantity: 0 }]),
    );
    assert.ok(r.errors.includes('INVALID_ITEM_TYPE'));
    assert.ok(r.errors.includes('INVALID_ITEM_ID'));
    assert.ok(r.errors.includes('INVALID_QUANTITY'));
  });

  await t.test('⚠️ 服務的 quantity 必須是 1', () => {
    const r = checkout.validatePayload(
      payload([item({ itemType: 'service', itemId: 'svc-1', quantity: 2 })]),
    );
    assert.ok(r.errors.includes('INVALID_SERVICE_QUANTITY'));
  });
});

test('buildCheckoutView：明細與金額', async (t) => {
  await t.test('無規格商品：單價、數量、材料費', () => {
    const view = build(payload([item({ quantity: 2 })], { expectedTotalCents: 1600 }));
    assert.equal(view.ok, true);
    assert.equal(view.orderType, 'product');
    assert.equal(view.lines.length, 1);
    assert.equal(view.lines[0].name, '排水管接頭');
    assert.equal(view.lines[0].image, 'p2.png');
    assert.equal(view.lines[0].unitPriceCents, 800);
    assert.equal(view.lines[0].lineTotalCents, 1600);
    assert.equal(view.materialTotalCents, 1600);
    assert.equal(view.serviceTotalCents, 0);
    assert.equal(view.goodsTotalCents, 1600);
    assert.equal(view.totalCents, 1600);
    assert.equal(view.priceChanged, false);
  });

  await t.test('有規格商品：用 SKU 價格與規格文字', () => {
    const view = build(
      payload([item({ itemId: 'prd-1', skuId: 'sku-big', quantity: 1 })], { expectedTotalCents: 4800 }),
    );
    assert.equal(view.ok, true);
    assert.equal(view.lines[0].unitPriceCents, 4800);
    assert.equal(view.lines[0].specText, '大罐');
    assert.equal(view.lines[0].image, 'big.png');
    assert.equal(view.totalCents, 4800);
  });

  await t.test('服務：服務費、hasService', () => {
    const view = build(
      payload([item({ itemType: 'service', itemId: 'svc-1', quantity: 1 })], {
        expectedTotalCents: 10000,
      }),
    );
    assert.equal(view.ok, true);
    assert.equal(view.orderType, 'service');
    assert.equal(view.serviceTotalCents, 10000);
    assert.equal(view.materialTotalCents, 0);
    assert.equal(view.totalCents, 10000);
    assert.equal(view.hasService, true);
  });

  await t.test('混合單：材料費＋服務費', () => {
    const view = build(
      payload(
        [
          item({ itemId: 'prd-2', quantity: 2 }),
          item({ itemType: 'service', itemId: 'svc-1', quantity: 1 }),
        ],
        { expectedTotalCents: 11600 },
      ),
    );
    assert.equal(view.ok, true);
    assert.equal(view.orderType, 'mixed');
    assert.equal(view.materialTotalCents, 1600);
    assert.equal(view.serviceTotalCents, 10000);
    assert.equal(view.goodsTotalCents, 11600);
    assert.equal(view.totalCents, 11600);
    assert.equal(view.hasService, true);
  });

  await t.test('⚠️ 失效商品：不計入金額、ok=false', () => {
    const view = build(payload([item({ itemId: 'ghost' })], { expectedTotalCents: 0 }));
    assert.equal(view.ok, false);
    assert.equal(view.invalidLines.length, 1);
    assert.equal(view.invalidLines[0].reason, 'PRODUCT_NOT_FOUND');
    assert.equal(view.invalidLines[0].reasonText, '商品已不存在');
    assert.equal(view.totalCents, 0);
  });

  await t.test('⚠️ 失效服務：不計入金額', () => {
    const view = build(
      payload([item({ itemType: 'service', itemId: 'ghost', quantity: 1 })], {
        expectedTotalCents: 0,
      }),
    );
    assert.equal(view.ok, false);
    assert.equal(view.invalidLines[0].reason, 'SERVICE_NOT_FOUND');
    assert.equal(view.serviceTotalCents, 0);
  });

  await t.test('⚠️ 有規格但缺 skuId → SKU_REQUIRED', () => {
    const view = build(payload([item({ itemId: 'prd-1' })], { expectedTotalCents: 0 }));
    assert.equal(view.ok, false);
    assert.equal(view.invalidLines[0].reason, 'SKU_REQUIRED');
  });

  await t.test('⚠️ SKU 不存在 → SKU_NOT_FOUND', () => {
    const view = build(
      payload([item({ itemId: 'prd-1', skuId: 'nope' })], { expectedTotalCents: 0 }),
    );
    assert.equal(view.ok, false);
    assert.equal(view.invalidLines[0].reason, 'SKU_NOT_FOUND');
  });

  await t.test('價格與 expectedTotalCents 不同 → priceChanged', () => {
    const view = build(
      payload([item({ itemId: 'prd-2', quantity: 1 })], { expectedTotalCents: 999 }),
    );
    assert.equal(view.totalCents, 800);
    assert.equal(view.priceChanged, true);
  });

  await t.test('orderType 與 items 不一致 → orderTypeMismatch', () => {
    const view = build(
      payload([item({ itemId: 'prd-2' })], { orderType: 'service', expectedTotalCents: 800 }),
    );
    assert.equal(view.orderType, 'product');
    assert.equal(view.orderTypeMismatch, true);
  });

  await t.test('不合法的 payload → 空結果與錯誤碼', () => {
    const view = checkout.buildCheckoutView({ payload: null, products: [], services: [] });
    assert.equal(view.ok, false);
    assert.ok(view.errors.includes('INVALID_PAYLOAD'));
    assert.deepEqual(view.lines, []);
    assert.equal(view.totalCents, 0);
  });
});

test('specTextOf：規格文字', async (t) => {
  await t.test('找得到 SKU → 用 / 串接', () => {
    assert.equal(checkout.specTextOf(PRODUCT, 'sku-big'), '大罐');
  });

  await t.test('找不到／沒 skuId／沒 skus → 空字串', () => {
    assert.equal(checkout.specTextOf(PRODUCT, 'nope'), '');
    assert.equal(checkout.specTextOf(PRODUCT, null), '');
    assert.equal(checkout.specTextOf({}, 'sku-big'), '');
    assert.equal(checkout.specTextOf(null, 'sku-big'), '');
  });
});

test('與真實 fake 資料對齊', async (t) => {
  await t.test('prd-1 的 sku-big＝4800、svc-1＝10000', () => {
    const view = checkout.buildCheckoutView({
      payload: {
        orderType: 'mixed',
        items: [
          { itemType: 'product', itemId: 'prd-1', skuId: 'sku-big', quantity: 1 },
          { itemType: 'service', itemId: 'svc-1', quantity: 1 },
        ],
        expectedTotalCents: 14800,
      },
      products: PRODUCTS,
      services: SERVICES,
    });

    assert.equal(view.ok, true);
    assert.equal(view.materialTotalCents, 4800);
    assert.equal(view.serviceTotalCents, 10000);
    assert.equal(view.totalCents, 14800);
  });
});
