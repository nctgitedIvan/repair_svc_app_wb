'use strict';

/**
 * 目錄呈現組裝的測試。
 *
 * 重點：
 *   1. 分類樹的組裝（上下架、孤兒、排序、**每個一級一定有 children 陣列**）
 *   2. 混合清單的排序規則（服務在上、零件在下，各自按 order）
 *   3. 卡片欄位（既有 goods-card 只吃這幾個）
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const view = require('../../../utils/catalogView');
const { CATEGORIES, SERVICES, PRODUCTS } = require('../../../services/api/_fake/data');

const cat = (over = {}) => ({ categoryId: 'c1', name: '分類', parentId: null, order: 1, isActive: true, ...over });
const svc = (over = {}) => ({ serviceId: 's1', name: '服務', categoryId: 'c1', order: 1, priceCents: 100, isActive: true, ...over });
const prd = (over = {}) => ({ productId: 'p1', name: '零件', categoryId: 'c1', order: 1, priceCents: 50, isActive: true, ...over });

test('buildCategoryTree：兩層樹的組裝', async (t) => {
  await t.test('一級 → 二級，依 order 排序', () => {
    const tree = view.buildCategoryTree([
      cat({ categoryId: 'a', name: 'A', order: 2 }),
      cat({ categoryId: 'b', name: 'B', order: 1 }),
      cat({ categoryId: 'a2', name: 'A-2', parentId: 'a', order: 2 }),
      cat({ categoryId: 'a1', name: 'A-1', parentId: 'a', order: 1 }),
    ]);

    assert.deepEqual(tree.map((n) => n.name), ['B', 'A'], '一級依 order');
    assert.deepEqual(tree[1].children.map((c) => c.name), ['A-1', 'A-2'], '二級依 order');
  });

  await t.test('⚠️ 每個一級一定有 children 陣列（undefined 會讓 c-tabbar 丟 TypeError）', () => {
    const tree = view.buildCategoryTree([cat({ categoryId: 'a' }), cat({ categoryId: 'b', order: 2 })]);
    for (const node of tree) {
      assert.ok(Array.isArray(node.children), `${node.name} 的 children 不是陣列`);
    }
    assert.deepEqual(tree[0].children, [], '沒有二級的一級給空陣列');
  });

  await t.test('下架的分類不顯示（一級與二級都一樣）', () => {
    const tree = view.buildCategoryTree([
      cat({ categoryId: 'a', name: 'A', isActive: false }),
      cat({ categoryId: 'b', name: 'B' }),
      cat({ categoryId: 'b1', name: 'B-1', parentId: 'b', isActive: false }),
      cat({ categoryId: 'b2', name: 'B-2', parentId: 'b' }),
    ]);
    assert.deepEqual(tree.map((n) => n.name), ['B']);
    assert.deepEqual(tree[0].children.map((c) => c.name), ['B-2']);
  });

  await t.test('⚠️ 孤兒二級直接丟掉（父不存在或父已下架）', () => {
    const tree = view.buildCategoryTree([
      cat({ categoryId: 'a', name: 'A' }),
      cat({ categoryId: 'ghost', name: '孤兒', parentId: 'not-exist' }),
      cat({ categoryId: 'dead', name: '父已下架', parentId: 'gone' }),
      cat({ categoryId: 'gone', name: 'GONE', isActive: false }),
    ]);
    const all = tree.flatMap((n) => n.children.map((c) => c.name));
    assert.deepEqual(all, [], '孤兒不該出現在任何一級底下');
    assert.deepEqual(tree.map((n) => n.name), ['A']);
  });

  await t.test('沒有 order 時視為 0（排在最前），相同 order 維持原順序', () => {
    const tree = view.buildCategoryTree([
      cat({ categoryId: 'a', name: 'A', order: 1 }),
      cat({ categoryId: 'b', name: 'B', order: undefined }), // → 0
      cat({ categoryId: 'c', name: 'C', order: 5 }),
      cat({ categoryId: 'd', name: 'D', order: undefined }), // → 0，且維持在 B 之後
    ]);
    assert.deepEqual(tree.map((n) => n.name), ['B', 'D', 'A', 'C']);
  });

  await t.test('空輸入／undefined 不爆', () => {
    assert.deepEqual(view.buildCategoryTree([]), []);
    assert.deepEqual(view.buildCategoryTree(), []);
    assert.deepEqual(view.buildCategoryTree(null), []);
  });
});

test('mergeByCategory：服務在上、零件在下（T3.6 §9.1 的決策）', async (t) => {
  await t.test('⚠️ 服務一定排在零件前面（即使零件的 order 較小）', () => {
    const list = view.mergeByCategory({
      services: [svc({ serviceId: 's1', order: 9 })],
      products: [prd({ productId: 'p1', order: 1 })],
      categoryId: 'c1',
    });
    assert.deepEqual(list.map((i) => i.itemType), ['service', 'product']);
  });

  await t.test('各自按 order 排序', () => {
    const list = view.mergeByCategory({
      services: [svc({ serviceId: 's2', order: 2 }), svc({ serviceId: 's1', order: 1 })],
      products: [prd({ productId: 'p2', order: 2 }), prd({ productId: 'p1', order: 1 })],
      categoryId: 'c1',
    });
    assert.deepEqual(list.map((i) => i.serviceId || i.productId), ['s1', 's2', 'p1', 'p2']);
  });

  await t.test('只取該二級分類的項目', () => {
    const list = view.mergeByCategory({
      services: [svc({ serviceId: 's1', categoryId: 'c1' }), svc({ serviceId: 's2', categoryId: 'c2' })],
      products: [prd({ productId: 'p1', categoryId: 'c2' })],
      categoryId: 'c1',
    });
    assert.deepEqual(list.map((i) => i.serviceId), ['s1']);
    assert.equal(list.length, 1);
  });

  await t.test('下架的服務與零件都不顯示', () => {
    const list = view.mergeByCategory({
      services: [svc({ serviceId: 's1', isActive: false })],
      products: [prd({ productId: 'p1', isActive: false })],
      categoryId: 'c1',
    });
    assert.deepEqual(list, []);
  });

  await t.test('每筆都帶 itemType（呼叫端靠它決定點擊後去哪裡）', () => {
    const list = view.mergeByCategory({ services: [svc()], products: [prd()], categoryId: 'c1' });
    assert.equal(list[0].itemType, view.ItemType.SERVICE);
    assert.equal(list[1].itemType, view.ItemType.PRODUCT);
  });

  await t.test('沒有 categoryId 或清單為空 → 空陣列，不爆', () => {
    assert.deepEqual(view.mergeByCategory({ services: [svc()], products: [], categoryId: '' }), []);
    assert.deepEqual(view.mergeByCategory({}), []);
    assert.deepEqual(view.mergeByCategory(), []);
  });
});

test('toCardModel：餵給既有 goods-card 的欄位', async (t) => {
  await t.test('服務與零件用同一套欄位', () => {
    // T6a.3：主圖走 images[0]
    const s = view.toCardModel({ ...svc({ serviceId: 's1', name: '水管疏通', images: ['x.png'], priceCents: 8000 }), itemType: 'service' });
    const p = view.toCardModel({ ...prd({ productId: 'p1', name: '接頭', images: ['y.png'], priceCents: 800 }), itemType: 'product' });

    assert.equal(s.id, 's1');
    assert.equal(s.title, '水管疏通');
    assert.equal(s.price, 8000);
    assert.equal(s.thumb, 'x.png');
    assert.deepEqual(s.tags, ['服務']);
    assert.equal(p.id, 'p1');
    assert.deepEqual(p.tags, ['零件']);
  });

  await t.test('⚠️ 不產生 originPrice（電商欄位已下線，畫面上不該出現划線價）', () => {
    const card = view.toCardModel({ ...prd(), itemType: 'product' });
    assert.equal(card.originPrice, undefined);
  });

  await t.test('沒有 thumb 時給空字串（goods-card 用 wx:if 判斷）', () => {
    assert.equal(view.toCardModel({ ...svc(), itemType: 'service' }).thumb, '');
  });

  await t.test('null 不爆（回 null）', () => {
    assert.equal(view.toCardModel(null), null);
  });

  await t.test('帶出 specCount（頁面判斷加購行為用；卡片本身不渲染它）', () => {
    const withSpecs = view.toCardModel({ ...prd({ specs: [{ specId: 'a' }, { specId: 'b' }] }), itemType: 'product' });
    const noSpecs = view.toCardModel({ ...prd({ specs: [] }), itemType: 'product' });
    assert.equal(withSpecs.specCount, 2);
    assert.equal(noSpecs.specCount, 0);
  });
});

/**
 * T3.6.1：加購行為的分流規則。
 *
 * ⚠️ 這組測試保護的是「**服務不會被加進購物車**」與「**有規格不會被直接加入**」
 *    兩條業務規則 —— 它們在畫面上看不出來（圖示長得一樣），只有行為有差。
 */
test('addActionFor：加購行為的分流（T3.6.1）', async (t) => {
  await t.test('⚠️ 服務 → SERVICE（§3.7.2：服務永遠不進購物車）', () => {
    assert.equal(view.addActionFor({ itemType: 'service', specCount: 0 }), view.AddAction.SERVICE);
    assert.equal(view.addActionFor({ itemType: 'service', specs: [] }), view.AddAction.SERVICE);
  });

  await t.test('零件、無規格 → ADD', () => {
    assert.equal(view.addActionFor({ itemType: 'product', specCount: 0 }), view.AddAction.ADD);
    assert.equal(view.addActionFor({ itemType: 'product', specs: [] }), view.AddAction.ADD);
  });

  await t.test('⚠️ 零件、有規格 → CHOOSE_SPEC（直接加會漏掉規格）', () => {
    assert.equal(view.addActionFor({ itemType: 'product', specCount: 2 }), view.AddAction.CHOOSE_SPEC);
    assert.equal(view.addActionFor({ itemType: 'product', specs: [{ specId: 'a' }] }), view.AddAction.CHOOSE_SPEC);
  });

  await t.test('specCount 與 specs 都缺時視為無規格（不誤判為有規格）', () => {
    assert.equal(view.addActionFor({ itemType: 'product' }), view.AddAction.ADD);
  });

  await t.test('⚠️ T5-3：整件售完 → SOLD_OUT，且優先於「選規格」', () => {
    assert.equal(view.addActionFor({ itemType: 'product', specCount: 0, isSoldOut: true }), view.AddAction.SOLD_OUT);
    assert.equal(view.addActionFor({ itemType: 'product', specCount: 2, isSoldOut: true }), view.AddAction.SOLD_OUT);
  });

  await t.test('T5-3：原始項目沒有 isSoldOut 時，用庫存即時判斷', () => {
    assert.equal(view.addActionFor({ itemType: 'product', specs: [], stock: 0 }), view.AddAction.SOLD_OUT);
    assert.equal(view.addActionFor({ itemType: 'product', specs: [], stock: 2 }), view.AddAction.ADD);
  });

  await t.test('T5-3：服務即使標記售完也回 SERVICE（服務沒有售完概念）', () => {
    assert.equal(view.addActionFor({ itemType: 'service', isSoldOut: true }), view.AddAction.SERVICE);
  });

  await t.test('null/undefined → null（呼叫端自己防護）', () => {
    assert.equal(view.addActionFor(null), null);
    assert.equal(view.addActionFor(undefined), null);
  });

  await t.test('拿真實 fake 資料驗一次：服務／有規格零件／無規格零件', () => {
    const cards = view
      .mergeByCategory({ services: SERVICES, products: PRODUCTS, categoryId: 'cat_ac_repair' })
      .map(view.toCardModel);
    const actions = cards.map((c) => view.addActionFor(c));
    assert.ok(actions.includes(view.AddAction.SERVICE), '冷氣維修是服務');
    assert.ok(actions.includes(view.AddAction.CHOOSE_SPEC), '冷媒 R410 有兩種規格');
  });

  await t.test('T5-3：真實資料的 prd-3（stock 0）→ SOLD_OUT', () => {
    const card = view.toCardModel({ ...PRODUCTS.find((p) => p.productId === 'prd-3'), itemType: 'product' });
    assert.equal(view.addActionFor(card), view.AddAction.SOLD_OUT);
  });
});

/**
 * 這一組把「畫面規則」與**真實 fake 資料**對起來 ——
 * 前面的測試用的是自己造的小資料，這裡確認真實資料也符合同樣的前提。
 */
test('與真實 fake 資料對齊（分類頁的驗收前提）', async (t) => {
  const tree = view.buildCategoryTree(CATEGORIES);

  await t.test('四個一級：水／電／空調／家具（已停用的不顯示）', () => {
    assert.deepEqual(tree.map((n) => n.name), ['水', '電', '空調', '家具']);
  });

  await t.test('水的二級：水管／水龍頭／熱水器', () => {
    const water = tree.find((n) => n.name === '水');
    assert.deepEqual(water.children.map((c) => c.name), ['水管', '水龍頭', '熱水器']);
  });

  await t.test('⚠️ 每個二級至少有一個上架的服務或零件（否則 tab 點進去是空的）', () => {
    const empties = [];
    for (const parent of tree) {
      for (const child of parent.children) {
        const items = view.mergeByCategory({ services: SERVICES, products: PRODUCTS, categoryId: child.categoryId });
        if (items.length === 0) empties.push(`${parent.name}/${child.name}`);
      }
    }
    assert.deepEqual(empties, [], `這些二級分類是空的：${empties.join('、')}`);
  });

  await t.test('二級的 categoryId 真的有服務或零件指向它（沒有打錯字）', () => {
    const known = new Set([...SERVICES.map((s) => s.categoryId), ...PRODUCTS.map((p) => p.categoryId)]);
    const orphans = CATEGORIES.filter((c) => c.parentId && c.isActive && !known.has(c.categoryId)).map((c) => c.name);
    assert.deepEqual(orphans, [], `沒有項目指向的二級分類：${orphans.join('、')}`);
  });

  await t.test('一級分類的名稱與服務／零件的 category 字串一致', () => {
    const names = new Set(tree.map((n) => n.name));
    for (const item of [...SERVICES, ...PRODUCTS]) {
      assert.ok(names.has(item.category), `${item.name} 的 category「${item.category}」不是一級分類名稱`);
    }
  });

  await t.test('⚠️ T4 的四種邊界情況仍然可觸發（T3.6 沒有破壞它們）', () => {
    assert.ok(PRODUCTS.some((p) => p.stock === 0 && p.isActive), '缺少「已售完」（stock 0）');
    assert.ok(PRODUCTS.some((p) => p.isActive && p.stock > 0 && p.stock <= 3), '缺少「庫存不足」');
    assert.ok(PRODUCTS.some((p) => p.isActive === false), '缺少「已下架」');
    assert.ok(PRODUCTS.some((p) => Number.isInteger(p.priceCents)), '缺少可改價的零件');
  });

  await t.test('混合清單的順序：先服務後零件（拿真實資料驗一次）', () => {
    const list = view.mergeByCategory({ services: SERVICES, products: PRODUCTS, categoryId: 'cat_water_pipe' });
    assert.deepEqual(list.map((i) => i.itemType), ['service', 'product']);
    assert.deepEqual(list.map((i) => i.name), ['水管疏通', '排水管接頭']);
  });
});

// ── T5：商品列表的純函式 ──

test('mergeCatalog：商品列表的預設順序（T5）', async (t) => {
  await t.test('⚠️ 零件在上、服務在下，各自依 order（與分類頁相反）', () => {
    const services = [svc({ serviceId: 's1', order: 2 }), svc({ serviceId: 's2', order: 1 })];
    const products = [prd({ productId: 'p1', order: 2 }), prd({ productId: 'p2', order: 1 })];

    const list = view.mergeCatalog({ services, products });
    assert.deepEqual(list.map((i) => i.productId || i.serviceId), ['p2', 'p1', 's2', 's1']);
    assert.deepEqual(list.map((i) => i.itemType), ['product', 'product', 'service', 'service']);
  });

  await t.test('下架的項目不出現', () => {
    const list = view.mergeCatalog({
      services: [svc({ serviceId: 's1' }), svc({ serviceId: 's2', isActive: false })],
      products: [prd({ productId: 'p1' }), prd({ productId: 'p2', isActive: false })],
    });
    assert.deepEqual(list.map((i) => i.productId || i.serviceId), ['p1', 's1']);
  });

  await t.test('空輸入不爆', () => {
    assert.deepEqual(view.mergeCatalog(), []);
    assert.deepEqual(view.mergeCatalog({}), []);
  });

  await t.test('真實 fake 資料：上架的零件＋服務，下架的 prd-4 不在', () => {
    const list = view.mergeCatalog({ services: SERVICES, products: PRODUCTS });
    const expected =
      PRODUCTS.filter((p) => p.isActive !== false).length + SERVICES.filter((s) => s.isActive !== false).length;

    assert.equal(list.length, expected);
    assert.ok(!list.some((i) => i.productId === 'prd-4'), '下架商品不該出現在列表');
    assert.equal(list[0].itemType, 'product', '第一筆是零件');
  });
});

test('filterCatalogItems：關鍵字／分類／價格（T5）', async (t) => {
  const items = [
    { ...prd({ productId: 'p1', name: '冷媒 R410', nameEn: 'Refrigerant R410', category: '空調', priceCents: 2500 }), itemType: 'product' },
    { ...prd({ productId: 'p2', name: '排水管接頭', description: '通用型 PVC 接頭', category: '水', priceCents: 800 }), itemType: 'product' },
    { ...svc({ serviceId: 's1', name: '冷氣清洗', category: '空調', priceCents: 6000 }), itemType: 'service' },
  ];

  await t.test('關鍵字比對名稱（中文）', () => {
    assert.deepEqual(view.filterCatalogItems(items, { keyword: '冷氣' }).map((i) => i.productId || i.serviceId), ['s1']);
  });

  await t.test('關鍵字比對英文名，且不分大小寫、會 trim', () => {
    assert.deepEqual(view.filterCatalogItems(items, { keyword: '  refrigerant ' }).map((i) => i.productId), ['p1']);
    assert.deepEqual(view.filterCatalogItems(items, { keyword: 'REFRIGERANT' }).map((i) => i.productId), ['p1']);
  });

  await t.test('關鍵字比對描述', () => {
    assert.deepEqual(view.filterCatalogItems(items, { keyword: 'PVC' }).map((i) => i.productId), ['p2']);
  });

  await t.test('分類比對的是一級分類名稱', () => {
    assert.deepEqual(
      view.filterCatalogItems(items, { category: '空調' }).map((i) => i.productId || i.serviceId),
      ['p1', 's1'],
    );
  });

  await t.test('價格區間含邊界', () => {
    assert.deepEqual(
      view.filterCatalogItems(items, { minPriceCents: 800, maxPriceCents: 2500 }).map((i) => i.productId || i.serviceId),
      ['p1', 'p2'],
    );
    assert.deepEqual(view.filterCatalogItems(items, { minPriceCents: 2501 }).map((i) => i.productId || i.serviceId), ['s1']);
  });

  await t.test('沒有條件時回傳同長度的新陣列', () => {
    const result = view.filterCatalogItems(items, {});
    assert.equal(result.length, items.length);
    assert.notEqual(result, items, '不應回傳同一個陣列參考');
  });

  await t.test('沒有價格的項目在有價格區間時被排除', () => {
    const noPrice = { ...prd({ productId: 'p3', name: '無價商品' }), priceCents: undefined, itemType: 'product' };
    assert.deepEqual(
      view.filterCatalogItems([...items, noPrice], { minPriceCents: 0 }).map((i) => i.productId || i.serviceId),
      ['p1', 'p2', 's1'],
    );
  });
});

test('sortCatalogItems：綜合／價格升降（T5）', async (t) => {
  const items = [
    { name: 'a', priceCents: 200 },
    { name: 'b', priceCents: 100 },
    { name: 'c', priceCents: 200 },
    { name: 'd', priceCents: 300 },
  ];

  await t.test('asc／desc', () => {
    assert.deepEqual(view.sortCatalogItems(items, 'asc').map((i) => i.name), ['b', 'a', 'c', 'd']);
    assert.deepEqual(view.sortCatalogItems(items, 'desc').map((i) => i.name), ['d', 'a', 'c', 'b']);
  });

  await t.test('同價保持原順序（穩定排序）', () => {
    assert.deepEqual(view.sortCatalogItems(items, 'asc').filter((i) => i.priceCents === 200).map((i) => i.name), ['a', 'c']);
  });

  await t.test('綜合（空字串／未知值）維持原順序，且回傳新陣列', () => {
    const result = view.sortCatalogItems(items, '');
    assert.deepEqual(result.map((i) => i.name), ['a', 'b', 'c', 'd']);
    assert.notEqual(result, items);
    assert.deepEqual(view.sortCatalogItems(items, 'unknown').map((i) => i.name), ['a', 'b', 'c', 'd']);
  });

  await t.test('沒有價格的項目不論升冪或降冪都排在最後', () => {
    const withMissing = [...items, { name: 'x' }];
    assert.equal(view.sortCatalogItems(withMissing, 'asc').slice(-1)[0].name, 'x');
    assert.equal(view.sortCatalogItems(withMissing, 'desc').slice(-1)[0].name, 'x');
  });
});

test('paginateItems：本機分頁（T5）', async (t) => {
  const items = Array.from({ length: 25 }, (_, i) => ({ id: i }));

  await t.test('第 1 頁與第 2 頁', () => {
    const first = view.paginateItems(items, { page: 1, pageSize: 10 });
    assert.equal(first.list.length, 10);
    assert.equal(first.total, 25);
    assert.equal(first.hasMore, true);
    assert.equal(first.list[0].id, 0);

    const second = view.paginateItems(items, { page: 2, pageSize: 10 });
    assert.equal(second.list.length, 10);
    assert.equal(second.list[0].id, 10);
  });

  await t.test('最後一頁 hasMore = false', () => {
    const last = view.paginateItems(items, { page: 3, pageSize: 10 });
    assert.equal(last.list.length, 5);
    assert.equal(last.hasMore, false);
  });

  await t.test('超出範圍回空陣列（不爆）', () => {
    const beyond = view.paginateItems(items, { page: 4, pageSize: 10 });
    assert.deepEqual(beyond.list, []);
    assert.equal(beyond.hasMore, false);
  });

  await t.test('不合法參數給預設值', () => {
    const result = view.paginateItems(items, { page: 0, pageSize: 0 });
    assert.equal(result.page, 1);
    assert.equal(result.pageSize, 10);
  });

  await t.test('空清單', () => {
    assert.deepEqual(view.paginateItems([]), { list: [], total: 0, page: 1, pageSize: 10, hasMore: false });
    assert.deepEqual(view.paginateItems(null).list, []);
  });
});

test('isSoldOutItem／toCardModel：售完規則（T5）', async (t) => {
  await t.test('服務永遠不是售完', () => {
    assert.equal(view.isSoldOutItem(svc({ itemType: 'service' })), false);
    assert.equal(view.isSoldOutItem({ ...svc({ itemType: 'service' }), stock: 0, skus: [] }), false);
  });

  await t.test('無規格商品：stock ≤ 0 才是售完', () => {
    assert.equal(view.isSoldOutItem({ itemType: 'product', stock: 0, specs: [], skus: [] }), true);
    assert.equal(view.isSoldOutItem({ itemType: 'product', stock: 2, specs: [], skus: [] }), false);
  });

  await t.test('有 SKU 的商品：所有 SKU 都沒貨才是售完', () => {
    const skus = [{ skuId: 'a', stock: 0 }, { skuId: 'b', stock: 0 }];
    assert.equal(view.isSoldOutItem({ itemType: 'product', skus, specs: [{}] }), true);

    const oneLeft = [{ skuId: 'a', stock: 0 }, { skuId: 'b', stock: 1 }];
    assert.equal(view.isSoldOutItem({ itemType: 'product', skus: oneLeft, specs: [{}] }), false);
  });

  await t.test('卡片 model 帶 isSoldOut 與「已售完」標籤', () => {
    const soldOut = view.toCardModel({ ...prd({ productId: 'p1', stock: 0, specs: [], skus: [] }), itemType: 'product' });
    assert.equal(soldOut.isSoldOut, true);
    assert.deepEqual(soldOut.tags, ['零件', '已售完']);

    const normal = view.toCardModel({ ...prd({ productId: 'p2', stock: 1, specs: [], skus: [] }), itemType: 'product' });
    assert.equal(normal.isSoldOut, false);
    assert.deepEqual(normal.tags, ['零件']);
  });

  await t.test('拿真實 fake 資料驗一次：prd-3 售完、prd-1 有 SKU 且未售完', () => {
    const prd3 = PRODUCTS.find((p) => p.productId === 'prd-3');
    const prd1 = PRODUCTS.find((p) => p.productId === 'prd-1');
    assert.equal(view.isSoldOutItem({ ...prd3, itemType: 'product' }), true);
    assert.equal(view.isSoldOutItem({ ...prd1, itemType: 'product' }), false);
  });
});
