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
    const s = view.toCardModel({ ...svc({ serviceId: 's1', name: '水管疏通', thumb: 'x.png', priceCents: 8000 }), itemType: 'service' });
    const p = view.toCardModel({ ...prd({ productId: 'p1', name: '接頭', thumb: 'y.png', priceCents: 800 }), itemType: 'product' });

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
