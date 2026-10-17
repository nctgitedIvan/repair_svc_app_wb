'use strict';

/** 目錄模組 Repository 契約案例（P2b-2）。 */

const assert = require('node:assert/strict');

const serviceCases = [
  {
    name: 'save／findById 完整往返',
    async run(repo) {
      await repo.save({
        serviceId: 'svc-1',
        name: '冷氣維修',
        nameEn: 'AC Repair',
        description: '到府檢修',
        detailHtml: '<p>流程</p>',
        images: ['a.png', 'b.png'],
        category: '空調',
        categoryId: 'cat_ac_repair',
        order: 1,
        priceCents: 10000,
        durationMinutes: 60,
        skillTags: ['空調', '乙級'],
        isActive: true,
      });

      assert.deepEqual(await repo.findById('svc-1'), {
        merchantId: 'platform',
        serviceId: 'svc-1',
        name: '冷氣維修',
        nameEn: 'AC Repair',
        description: '到府檢修',
        detailHtml: '<p>流程</p>',
        images: ['a.png', 'b.png'],
        category: '空調',
        categoryId: 'cat_ac_repair',
        order: 1,
        priceCents: 10000,
        durationMinutes: 60,
        skillTags: ['空調', '乙級'],
        isActive: true,
      });
    },
  },
  {
    name: 'listActive 排除下架、依 order／name 排序',
    async run(repo) {
      await repo.save({ serviceId: 's2', name: 'B', order: 2, isActive: true });
      await repo.save({ serviceId: 's1', name: 'A', order: 1, isActive: true });
      await repo.save({ serviceId: 's3', name: 'C', order: 1, isActive: false });

      assert.deepEqual((await repo.listActive()).map((s) => s.serviceId), ['s1', 's2']);
    },
  },
  {
    name: '缺省值與再次 save 覆蓋',
    async run(repo) {
      await repo.save({ serviceId: 's1', name: 'A' });
      assert.deepEqual((await repo.findById('s1')).images, []);
      await repo.save({ serviceId: 's1', name: 'B' });
      assert.equal((await repo.findById('s1')).name, 'B');
    },
  },
  {
    name: '參數不合法 → TypeError',
    async run(repo) {
      await assert.rejects(() => repo.save(null), TypeError);
      await assert.rejects(() => repo.save({ serviceId: '', name: 'A' }), TypeError);
      await assert.rejects(() => repo.save({ serviceId: 's1', name: '' }), TypeError);
      await assert.rejects(() => repo.findById(''), TypeError);
    },
  },
];

const productCases = [
  {
    name: 'save／findById 完整往返（含 specs／skus／images）',
    async run(repo) {
      await repo.save({
        productId: 'prd-1',
        name: '冷媒 R410',
        nameEn: 'Refrigerant R410',
        description: '適用 R410A',
        detailHtml: '<p>詳情</p>',
        images: ['p1.png', 'p2.png'],
        category: '空調',
        categoryId: 'cat_ac_repair',
        order: 1,
        priceCents: 2500,
        stock: 20,
        specs: [{ specId: 'size', title: '規格', values: ['標準罐', '大罐'] }],
        skus: [
          { skuId: 'sku-std', specValues: ['標準罐'], priceCents: 2500, stock: 20, image: 'p1.png' },
          { skuId: 'sku-big', specValues: ['大罐'], priceCents: 4800, stock: 8, image: 'p2.png' },
        ],
        isActive: true,
      });

      assert.deepEqual(await repo.findById('prd-1'), {
        merchantId: 'platform',
        productId: 'prd-1',
        name: '冷媒 R410',
        nameEn: 'Refrigerant R410',
        description: '適用 R410A',
        detailHtml: '<p>詳情</p>',
        images: ['p1.png', 'p2.png'],
        category: '空調',
        categoryId: 'cat_ac_repair',
        order: 1,
        priceCents: 2500,
        stock: 20,
        specs: [{ specId: 'size', title: '規格', values: ['標準罐', '大罐'] }],
        skus: [
          { skuId: 'sku-std', specValues: ['標準罐'], priceCents: 2500, stock: 20, image: 'p1.png' },
          { skuId: 'sku-big', specValues: ['大罐'], priceCents: 4800, stock: 8, image: 'p2.png' },
        ],
        isActive: true,
      });
    },
  },
  {
    name: 'listActive 排除下架、依 order／name 排序',
    async run(repo) {
      await repo.save({ productId: 'p2', name: 'B', order: 2, isActive: true });
      await repo.save({ productId: 'p1', name: 'A', order: 1, isActive: true });
      await repo.save({ productId: 'p3', name: 'C', order: 1, isActive: false });

      assert.deepEqual((await repo.listActive()).map((p) => p.productId), ['p1', 'p2']);
    },
  },
  {
    name: '缺省值與再次 save 覆蓋',
    async run(repo) {
      await repo.save({ productId: 'p1', name: 'A' });
      const product = await repo.findById('p1');
      assert.deepEqual(product.images, []);
      assert.deepEqual(product.specs, []);
      assert.deepEqual(product.skus, []);
      assert.equal(product.stock, 0);

      await repo.save({ productId: 'p1', name: 'B' });
      assert.equal((await repo.findById('p1')).name, 'B');
    },
  },
  {
    name: '參數不合法 → TypeError',
    async run(repo) {
      await assert.rejects(() => repo.save(null), TypeError);
      await assert.rejects(() => repo.save({ productId: '', name: 'A' }), TypeError);
      await assert.rejects(() => repo.save({ productId: 'p1', name: '' }), TypeError);
      await assert.rejects(() => repo.findById(''), TypeError);
    },
  },
];

module.exports = { serviceCases, productCases };
