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
  nameEn: 'Refrigerant R410',
  detailHtml: '<p>適用 R410A 系統</p>',
  priceCents: 2500,
  stock: 20,
  isActive: true,
  // T6a.3：主圖走 images[]（thumb 已從模型移除）
  images: ['https://x/1.png', 'https://x/1b.png'],
  // 規格＝維度；組合＝SKU（specValues 的順序必須與 specs 一致）
  specs: [{ specId: 'size', title: '規格', values: ['標準罐', '大罐'] }],
  skus: [
    { skuId: 'sku-std', specValues: ['標準罐'], priceCents: 2500, stock: 20, image: 'https://x/1.png' },
    { skuId: 'sku-big', specValues: ['大罐'], priceCents: 4800, stock: 8, image: 'https://x/1b.png' },
  ],
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
  images: ['https://x/s.png'],
};

const build = (item, itemType) => detail.buildDetailView({ item, itemType });
const specModel = (item, itemType) => detail.toSpecPopupModel({ item, itemType });

test('buildDetailView：基本欄位', async (t) => {
  await t.test('商品：id／圖／名／價', () => {
    const v = build(PRODUCT, 'product');
    assert.equal(v.itemType, 'product');
    assert.equal(v.id, 'prd-1');
    assert.deepEqual(v.images, ['https://x/1.png', 'https://x/1b.png']);
    assert.equal(v.thumb, 'https://x/1.png', 'thumb 是主圖');
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
    assert.deepEqual(build({ ...PRODUCT, images: [] }, 'product').images, []);
  });

  await t.test('主圖取 images[0]；多圖會全部保留（詳情頁 swiper 用）', () => {
    const v = build(PRODUCT, 'product');
    assert.equal(v.thumb, 'https://x/1.png');
    assert.deepEqual(v.images, ['https://x/1.png', 'https://x/1b.png']);
  });

  await t.test('detailHtml 與 nameEn 有帶出來（rich-text／英文名用）', () => {
    const v = build(PRODUCT, 'product');
    assert.equal(v.detailHtml, '<p>適用 R410A 系統</p>');
    assert.equal(v.titleEn, 'Refrigerant R410');
  });
});

test('buildDetailView：商品與服務的差異（共用同一頁的關鍵）', async (t) => {
  await t.test('商品有庫存與規格；服務沒有', () => {
    const p = build(PRODUCT, 'product');
    assert.equal(p.stock, 20);
    assert.equal(p.hasSpecs, true);
    assert.equal(p.specCount, 1, 'specCount 是**維度數**（不是規格值數量）');
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
  await t.test('無規格商品庫存 0 → isSoldOut 且不能加購', () => {
    const v = build({ ...PRODUCT, specs: [], skus: [], stock: 0 }, 'product');
    assert.equal(v.isSoldOut, true);
    assert.equal(v.canAddToCart, false);
    assert.equal(v.showBuyButtons, false);
  });

  await t.test('⚠️ 有 SKU 的商品：全部 SKU 都沒貨才算售完', () => {
    const allZero = { ...PRODUCT, skus: PRODUCT.skus.map((s) => ({ ...s, stock: 0 })) };
    assert.equal(build(allZero, 'product').isSoldOut, true);

    // 商品層 stock 為 0 但還有 SKU 有貨 → 仍可買（§7.4.2：有 SKU 時商品層 stock 不使用）
    const stockIrrelevant = { ...PRODUCT, stock: 0 };
    assert.equal(build(stockIrrelevant, 'product').isSoldOut, false);
    assert.equal(build(stockIrrelevant, 'product').canAddToCart, true);
  });

  await t.test('已下架 → isDelisted 且不能加購', () => {
    const v = build({ ...PRODUCT, isActive: false }, 'product');
    assert.equal(v.isDelisted, true);
    assert.equal(v.canAddToCart, false);
  });

  await t.test('無規格商品的數量上限＝庫存（原本彈窗硬寫成 2）', () => {
    const noSpec = { ...PRODUCT, specs: [], skus: [] };
    assert.equal(build({ ...noSpec, stock: 3 }, 'product').maxBuyQuantity, 3);
    assert.equal(build({ ...noSpec, stock: 20 }, 'product').maxBuyQuantity, 20);
  });

  await t.test('⚠️ 有 SKU 的商品：未選規格前，上限＝所有 SKU 的最大庫存', () => {
    // PRODUCT 的兩個 SKU 庫存是 20 / 8
    assert.equal(build(PRODUCT, 'product').maxBuyQuantity, 20);
  });

  await t.test('庫存大於上限時夾到 999', () => {
    assert.equal(
      build({ ...PRODUCT, specs: [], skus: [], stock: 5000 }, 'product').maxBuyQuantity,
      detail.MAX_BUY_QUANTITY,
    );
    const bigSkus = { ...PRODUCT, skus: PRODUCT.skus.map((s) => ({ ...s, stock: 5000 })) };
    assert.equal(build(bigSkus, 'product').maxBuyQuantity, detail.MAX_BUY_QUANTITY);
  });

  await t.test('服務的數量上限就是上限值（無庫存可依據）', () => {
    assert.equal(build(SERVICE, 'service').maxBuyQuantity, detail.MAX_BUY_QUANTITY);
  });
});

test('toSpecPopupModel：直接映射規格彈窗的形狀（T6a.3）', async (t) => {
  await t.test('⚠️ 無規格 → null（呼叫端據此決定「直接加入」）', () => {
    assert.equal(specModel({ ...PRODUCT, specs: [], skus: [] }, 'product'), null);
    assert.equal(specModel(SERVICE, 'service'), null, '服務恆為 null');
    assert.equal(detail.toSpecPopupModel(), null);
  });

  await t.test('specList 直接映射 specs（維度 → title＋values）', () => {
    const m = specModel(PRODUCT, 'product');
    assert.equal(m.specList.length, 1);
    assert.equal(m.specList[0].specId, 'size');
    assert.equal(m.specList[0].title, '規格');
    assert.deepEqual(
      m.specList[0].specValueList.map((v) => [v.specValueId, v.specValue]),
      [['標準罐', '標準罐'], ['大罐', '大罐']],
    );
    assert.equal(m.specList[0].specValueList[0].isSelected, false, '預設未選');
  });

  await t.test('skuList 直接映射 skus（skuId 與各自的庫存）', () => {
    const m = specModel(PRODUCT, 'product');
    assert.deepEqual(m.skuList.map((s) => s.skuId), ['sku-std', 'sku-big']);
    assert.deepEqual(m.skuList.map((s) => s.quantity), [20, 8], '各 SKU 自己的庫存');
    assert.deepEqual(m.skuList[0].specInfo, [{ specId: 'size', specValueId: '標準罐' }]);
  });

  await t.test('⚠️ 某個 SKU 庫存 0 → 該 SKU 的 quantity 為 0（彈窗顯示售罄）', () => {
    const m = specModel({ ...PRODUCT, skus: PRODUCT.skus.map((s) => ({ ...s, stock: 0 })) }, 'product');
    assert.deepEqual(m.skuList.map((s) => s.quantity), [0, 0]);
  });

  await t.test('SKU 庫存大於上限時夾到 999', () => {
    const m = specModel({ ...PRODUCT, skus: PRODUCT.skus.map((s) => ({ ...s, stock: 5000 })) }, 'product');
    assert.deepEqual(m.skuList.map((s) => s.quantity), [999, 999]);
  });

  await t.test('多維度（兩個維度）也能映射', () => {
    const multi = {
      ...PRODUCT,
      specs: [
        { specId: 'size', title: '尺寸', values: ['S', 'L'] },
        { specId: 'color', title: '顏色', values: ['白', '黑'] },
      ],
      skus: [
        { skuId: 's-w', specValues: ['S', '白'], priceCents: 100, stock: 5, image: '' },
        { skuId: 'l-b', specValues: ['L', '黑'], priceCents: 200, stock: 3, image: '' },
      ],
    };
    const m = specModel(multi, 'product');
    assert.deepEqual(m.specList.map((s) => s.specId), ['size', 'color']);
    assert.deepEqual(m.skuList[1].specInfo, [
      { specId: 'size', specValueId: 'L' },
      { specId: 'color', specValueId: '黑' },
    ]);
  });
});

test('findSkuBySelection：從選擇找出 SKU（T6a.3 的核心）', async (t) => {
  const find = (selectedSku, item = PRODUCT) =>
    detail.findSkuBySelection({ specs: item.specs, skus: item.skus, selectedSku });

  await t.test('單維度：選「大罐」→ sku-big', () => {
    assert.equal(find({ size: '大罐' }).skuId, 'sku-big');
    assert.equal(find({ size: '標準罐' }).skuId, 'sku-std');
  });

  await t.test('⚠️ 尚未選完 → null（呼叫端據此提示「請先選擇規格」）', () => {
    assert.equal(find({}), null);
    assert.equal(find({ size: '' }), null);
    assert.equal(find(null), null);
    assert.equal(find(undefined), null);
  });

  await t.test('選了不存在的組合 → null', () => {
    assert.equal(find({ size: '特大罐' }), null);
  });

  await t.test('多維度：兩個維度都要選對才找得到', () => {
    const multi = {
      ...PRODUCT,
      specs: [
        { specId: 'size', title: '尺寸', values: ['S', 'L'] },
        { specId: 'color', title: '顏色', values: ['白', '黑'] },
      ],
      skus: [
        { skuId: 's-w', specValues: ['S', '白'], priceCents: 100, stock: 5 },
        { skuId: 'l-b', specValues: ['L', '黑'], priceCents: 200, stock: 3 },
      ],
    };
    assert.equal(find({ size: 'S', color: '白' }, multi).skuId, 's-w');
    assert.equal(find({ size: 'L', color: '黑' }, multi).skuId, 'l-b');
    assert.equal(find({ size: 'S', color: '黑' }, multi), null, '不存在的組合');
    assert.equal(find({ size: 'S' }, multi), null, '只選了一個維度');
  });

  await t.test('空 specs／空 skus → null，不爆', () => {
    assert.equal(detail.findSkuBySelection({ specs: [], skus: [], selectedSku: {} }), null);
    assert.equal(detail.findSkuBySelection(), null);
  });
});

test('stockOfSku：取 SKU 庫存', async (t) => {
  await t.test('找得到 → 回庫存', () => {
    assert.equal(detail.stockOfSku(PRODUCT.skus, 'sku-std'), 20);
    assert.equal(detail.stockOfSku(PRODUCT.skus, 'sku-big'), 8);
  });

  await t.test('找不到／參數不對 → null', () => {
    assert.equal(detail.stockOfSku(PRODUCT.skus, 'nope'), null);
    assert.equal(detail.stockOfSku(null, 'sku-std'), null);
    assert.equal(detail.stockOfSku(PRODUCT.skus, null), null);
  });
});

test('selectedSpecIdOf（@deprecated，T6a.3-3 會移除）', async (t) => {
  await t.test('單維度選了值 → 回該值（過渡期讓加購仍可運作）', () => {
    assert.equal(detail.selectedSpecIdOf({ size: '大罐' }), '大罐');
  });

  await t.test('尚未選 → null', () => {
    assert.equal(detail.selectedSpecIdOf({ size: '' }), null);
    assert.equal(detail.selectedSpecIdOf(null), null);
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
      assert.deepEqual(v.images, p.images, `${p.productId} 的圖不對`);
      assert.ok(v.detailHtml, `${p.productId} 沒有 detailHtml`);
      // ⚠️ 「不該再有舊欄位 thumb」的斷言留到 T6a.3-2（A2 才移除 raw thumb）
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
