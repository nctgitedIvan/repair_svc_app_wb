'use strict';

/**
 * 詳情頁 view model 的測試。
 *
 * 重點：
 *   1. 商品／服務的分支（**這是兩者共用同一頁的關鍵**）
 *   2. 底部按鈕的顯示決策（商品不得有立即下單、服務不得有加入購物車）
 *   3. 規格彈窗 model 的合成（含「無規格回 null」這條分流規則）
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const detail = require('../../../utils/detailView');
const { PRODUCTS, SERVICES } = require('../../../services/api/_fake/data');

const PRODUCT = {
  productId: 'prd-1',
  name: '冷媒 R410',
  description: '適用 R410A 系統',
  category: '空調',
  categoryId: 'cat_ac_repair',
  priceCents: 2500,
  stock: 20,
  isActive: true,
  thumb: 'https://x/1.png',
  specs: [{ specId: 'std', name: '標準罐' }, { specId: 'big', name: '大罐' }],
};

const SERVICE = {
  serviceId: 'svc-1',
  name: '冷氣維修',
  description: '到府檢修',
  category: '空調',
  categoryId: 'cat_ac_repair',
  priceCents: 10000,
  durationMinutes: 60,
  skillTags: ['空調', '乙級'],
  isActive: true,
  thumb: 'https://x/s.png',
};

const build = (item, itemType) => detail.buildDetailView({ item, itemType });
const specModel = (item, itemType) => detail.toSpecPopupModel({ item, itemType });

test('buildDetailView：基本欄位', async (t) => {
  await t.test('商品：id／圖／名／價', () => {
    const v = build(PRODUCT, 'product');
    assert.equal(v.itemType, 'product');
    assert.equal(v.id, 'prd-1');
    assert.deepEqual(v.images, ['https://x/1.png']);
    assert.equal(v.title, '冷媒 R410');
    assert.equal(v.priceCents, 2500);
    assert.equal(v.description, '適用 R410A 系統');
  });

  await t.test('服務：id 取自 serviceId', () => {
    const v = build(SERVICE, 'service');
    assert.equal(v.itemType, 'service');
    assert.equal(v.id, 'svc-1');
    assert.equal(v.durationMinutes, 60);
    assert.deepEqual(v.skillTags, ['空調', '乙級']);
  });

  await t.test('⚠️ 沒有 itemType 或 item 為空 → null（呼叫端必須明說型別）', () => {
    assert.equal(build(PRODUCT), null);
    assert.equal(build(null, 'product'), null);
    assert.equal(detail.buildDetailView(), null);
  });

  await t.test('沒有圖時 images 為空陣列（WXML 用 wx:if 判斷）', () => {
    assert.deepEqual(build({ ...PRODUCT, thumb: '' }, 'product').images, []);
  });
});

test('buildDetailView：商品與服務的差異（共用同一頁的關鍵）', async (t) => {
  await t.test('商品有庫存與規格；服務沒有', () => {
    const p = build(PRODUCT, 'product');
    assert.equal(p.stock, 20);
    assert.equal(p.hasSpecs, true);
    assert.equal(p.specCount, 2);
    assert.equal(p.durationMinutes, null);
    assert.deepEqual(p.skillTags, []);

    const s = build(SERVICE, 'service');
    assert.equal(s.stock, null, '服務沒有庫存概念');
    assert.equal(s.hasSpecs, false);
    assert.equal(s.specCount, 0);
    assert.equal(s.isSoldOut, false, '服務不會「售完」');
  });

  await t.test('⚠️ 商品不得有「立即下單」（P7a2a-C2）', () => {
    assert.equal(build(PRODUCT, 'product').canBuyNow, false);
    assert.equal(build(SERVICE, 'service').canBuyNow, false, '服務的立即預約屬 P7a-2b');
  });

  await t.test('⚠️ 服務不得有「加入購物車」（§3.7.2）', () => {
    assert.equal(build(SERVICE, 'service').canAddToCart, false);
    assert.equal(build(SERVICE, 'service').showBuyButtons, false, '服務的右下角留空');
    assert.equal(build(PRODUCT, 'product').canAddToCart, true);
  });
});

test('buildDetailView：庫存與上架狀態', async (t) => {
  await t.test('庫存 0 → isSoldOut 且不能加購', () => {
    const v = build({ ...PRODUCT, stock: 0 }, 'product');
    assert.equal(v.isSoldOut, true);
    assert.equal(v.canAddToCart, false);
    assert.equal(v.showBuyButtons, false);
  });

  await t.test('已下架 → isDelisted 且不能加購', () => {
    const v = build({ ...PRODUCT, isActive: false }, 'product');
    assert.equal(v.isDelisted, true);
    assert.equal(v.canAddToCart, false);
  });

  await t.test('⚠️ 數量上限＝庫存（原本彈窗硬寫成 2）', () => {
    assert.equal(build({ ...PRODUCT, stock: 3 }, 'product').maxBuyQuantity, 3);
    assert.equal(build({ ...PRODUCT, stock: 20 }, 'product').maxBuyQuantity, 20);
  });

  await t.test('庫存大於上限時夾到 999', () => {
    assert.equal(build({ ...PRODUCT, stock: 5000 }, 'product').maxBuyQuantity, detail.MAX_BUY_QUANTITY);
  });

  await t.test('服務的數量上限就是上限值（無庫存可依據）', () => {
    assert.equal(build(SERVICE, 'service').maxBuyQuantity, detail.MAX_BUY_QUANTITY);
  });
});

test('toSpecPopupModel：合成規格彈窗的形狀', async (t) => {
  await t.test('⚠️ 無規格 → null（呼叫端據此決定「直接加入」）', () => {
    assert.equal(specModel({ ...PRODUCT, specs: [] }, 'product'), null);
    assert.equal(specModel(SERVICE, 'service'), null, '服務恆為 null');
    assert.equal(detail.toSpecPopupModel(), null);
  });

  await t.test('單一維度：title 固定「規格」，值取自 specs', () => {
    const m = specModel(PRODUCT, 'product');
    assert.equal(m.specList.length, 1);
    assert.equal(m.specList[0].specId, detail.SPEC_DIMENSION_ID);
    assert.equal(m.specList[0].title, detail.SPEC_DIMENSION_TITLE);
    assert.deepEqual(
      m.specList[0].specValueList.map((v) => [v.specValueId, v.specValue]),
      [['std', '標準罐'], ['big', '大罐']],
    );
    assert.equal(m.specList[0].specValueList[0].isSelected, false, '預設未選');
  });

  await t.test('skuList：每個規格值一個 SKU，庫存＝商品總庫存', () => {
    const m = specModel(PRODUCT, 'product');
    assert.deepEqual(m.skuList.map((s) => s.skuId), ['std', 'big']);
    assert.deepEqual(m.skuList.map((s) => s.quantity), [20, 20]);
    assert.deepEqual(m.skuList[0].specInfo, [{ specId: detail.SPEC_DIMENSION_ID, specValueId: 'std' }]);
  });

  await t.test('⚠️ 庫存 0 → SKU 數量 0（彈窗據此顯示「該規格已售罄」）', () => {
    const m = specModel({ ...PRODUCT, stock: 0 }, 'product');
    assert.deepEqual(m.skuList.map((s) => s.quantity), [0, 0]);
  });

  await t.test('庫存大於上限時夾到 999（彈窗的 stepper 上限）', () => {
    const m = specModel({ ...PRODUCT, stock: 5000 }, 'product');
    assert.deepEqual(m.skuList.map((s) => s.quantity), [999, 999]);
  });
});

test('selectedSpecIdOf：從彈窗的 selectedSku 取出選中的規格', async (t) => {
  await t.test('選了 → 回規格值 id', () => {
    assert.equal(detail.selectedSpecIdOf({ [detail.SPEC_DIMENSION_ID]: 'big' }), 'big');
  });

  await t.test('尚未選（空字串）→ null', () => {
    assert.equal(detail.selectedSpecIdOf({ [detail.SPEC_DIMENSION_ID]: '' }), null);
  });

  await t.test('形狀不對／undefined → null，不爆', () => {
    assert.equal(detail.selectedSpecIdOf(null), null);
    assert.equal(detail.selectedSpecIdOf(undefined), null);
    assert.equal(detail.selectedSpecIdOf({}), null);
  });
});

/**
 * 用**真實 fake 資料**驗一次 —— 前面的測試用的是自己造的小資料。
 */
test('與真實 fake 資料對齊', async (t) => {
  await t.test('每個商品都能組出詳情（有圖、有描述、有價）', () => {
    for (const p of PRODUCTS) {
      const v = build(p, 'product');
      assert.ok(v.title, `${p.productId} 沒有名稱`);
      // T6a-3 補上：沒有 description 的話「詳情介紹」區塊會是空的
      assert.ok(v.description, `${p.productId} 沒有 description`);
      assert.ok(Number.isInteger(v.priceCents), `${p.productId} 沒有價格`);
      assert.deepEqual(v.images, [p.thumb], `${p.productId} 的圖不對`);
    }
  });

  await t.test('每個服務都能組出詳情（有時長、有技能標籤），且都不能加購', () => {
    for (const s of SERVICES) {
      const v = build(s, 'service');
      assert.ok(v.title, `${s.serviceId} 缺名稱`);
      assert.ok(v.description, `${s.serviceId} 缺 description`);
      assert.equal(v.canAddToCart, false);
      assert.ok(v.durationMinutes > 0, `${s.serviceId} 缺時長`);
      // T6a-3 補上：§3.7.1 說服務有技能標籤
      assert.ok(v.skillTags.length > 0, `${s.serviceId} 缺技能標籤`);
    }
  });

  await t.test('有規格與無規格的商品都有（兩條路徑都可驗收）', () => {
    const withSpecs = PRODUCTS.filter((p) => build(p, 'product').hasSpecs);
    const without = PRODUCTS.filter((p) => !build(p, 'product').hasSpecs && p.isActive && p.stock > 0);
    assert.ok(withSpecs.length > 0, '缺少有規格的商品（無法驗收規格彈窗）');
    assert.ok(without.length > 0, '缺少無規格的商品（無法驗收直接加入）');
  });

  await t.test('庫存 0 與已下架的商品都存在（驗收「售完／下架」）', () => {
    assert.ok(PRODUCTS.some((p) => build(p, 'product').isSoldOut));
    assert.ok(PRODUCTS.some((p) => build(p, 'product').isDelisted));
  });
});
