'use strict';

/** P7b 前置 Repository 契約案例（P2b-3）。 */

const assert = require('node:assert/strict');

const cartCases = [
  {
    name: 'save／findByUserId 往返（items 內嵌）',
    async run(repo) {
      await repo.save({
        userId: 'u1',
        items: [
          {
            lineId: 'prd-1:sku-std',
            productId: 'prd-1',
            skuId: 'sku-std',
            quantity: 2,
            addedPriceCents: 2500,
            currency: 'CNY',
            addedAt: 1000,
          },
        ],
        updatedAt: 1000,
      });

      assert.deepEqual(await repo.findByUserId('u1'), {
        userId: 'u1',
        items: [
          {
            lineId: 'prd-1:sku-std',
            productId: 'prd-1',
            skuId: 'sku-std',
            quantity: 2,
            addedPriceCents: 2500,
            currency: 'CNY',
            addedAt: 1000,
          },
        ],
        updatedAt: 1000,
      });
    },
  },
  {
    name: '再次 save 會覆蓋、clearByUserId 會清空',
    async run(repo) {
      await repo.save({ userId: 'u1', items: [] });
      await repo.save({ userId: 'u1', items: [], updatedAt: 2 });
      assert.equal((await repo.findByUserId('u1')).updatedAt, 2);

      await repo.clearByUserId('u1');
      assert.equal(await repo.findByUserId('u1'), null);
    },
  },
  {
    name: '找不到 → null；參數不合法 → TypeError',
    async run(repo) {
      assert.equal(await repo.findByUserId('missing'), null);
      await assert.rejects(() => repo.save(null), TypeError);
      await assert.rejects(() => repo.save({ userId: '' }), TypeError);
      await assert.rejects(() => repo.findByUserId(''), TypeError);
    },
  },
];

const favoriteCases = [
  {
    name: 'add／isFavorite／listByCustomer',
    async run(repo) {
      await repo.add({
        customerId: 'c1',
        productId: 'prd-1',
        productSnapshot: { name: '冷媒 R410', image: 'x.png', priceCents: 2500 },
        createdAt: 1000,
      });

      assert.equal(await repo.isFavorite('c1', 'prd-1'), true);
      assert.equal(await repo.isFavorite('c1', 'prd-2'), false);

      const list = await repo.listByCustomer('c1');
      assert.equal(list.length, 1);
      assert.equal(list[0].productSnapshot.name, '冷媒 R410');
    },
  },
  {
    name: '⚠️ 重複 add 不會產生第二筆（唯一鍵）',
    async run(repo) {
      const favorite = {
        customerId: 'c1',
        productId: 'prd-1',
        productSnapshot: { name: 'A', image: '', priceCents: 1 },
        createdAt: 1000,
      };
      await repo.add(favorite);
      await repo.add({ ...favorite, productSnapshot: { name: 'B', image: '', priceCents: 2 } });
      assert.equal((await repo.listByCustomer('c1')).length, 1);
    },
  },
  {
    name: 'listByCustomer 依 createdAt 由新到舊',
    async run(repo) {
      await repo.add({ customerId: 'c1', productId: 'p1', createdAt: 1000 });
      await repo.add({ customerId: 'c1', productId: 'p2', createdAt: 2000 });
      assert.deepEqual((await repo.listByCustomer('c1')).map((f) => f.productId), ['p2', 'p1']);
    },
  },
  {
    name: 'remove 後 isFavorite=false',
    async run(repo) {
      await repo.add({ customerId: 'c1', productId: 'p1', createdAt: 1000 });
      await repo.remove('c1', 'p1');
      assert.equal(await repo.isFavorite('c1', 'p1'), false);
    },
  },
  {
    name: '參數不合法 → TypeError',
    async run(repo) {
      await assert.rejects(() => repo.add(null), TypeError);
      await assert.rejects(() => repo.isFavorite('', 'p1'), TypeError);
      await assert.rejects(() => repo.remove('c1', ''), TypeError);
    },
  },
];

const inquiryCases = [
  {
    name: 'create／findById／listByCustomer',
    async run(repo) {
      await repo.create({
        inquiryId: 'inq-1',
        customerId: 'c1',
        productId: 'prd-1',
        productSnapshot: { name: '冷媒 R410', image: 'x.png', priceCents: 2500 },
        message: '想問規格',
        status: 'pending',
        createdAt: 1000,
        csAgentId: null,
        replies: [],
      });

      const inquiry = await repo.findById('inq-1');
      assert.equal(inquiry.message, '想問規格');
      assert.equal((await repo.listByCustomer('c1')).length, 1);
    },
  },
  {
    name: 'listByCustomer 新到舊、listPending 舊到新',
    async run(repo) {
      await repo.create({ inquiryId: 'i1', customerId: 'c1', productId: 'p1', createdAt: 1000 });
      await repo.create({ inquiryId: 'i2', customerId: 'c1', productId: 'p2', createdAt: 2000 });

      assert.deepEqual((await repo.listByCustomer('c1')).map((i) => i.inquiryId), ['i2', 'i1']);
      assert.deepEqual((await repo.listPending()).map((i) => i.inquiryId), ['i1', 'i2']);
    },
  },
  {
    name: 'appendReply：追加回覆、狀態改 replied',
    async run(repo) {
      await repo.create({ inquiryId: 'i1', customerId: 'c1', productId: 'p1', createdAt: 1000 });
      const updated = await repo.appendReply('i1', {
        actorId: 'cs-1',
        actorRole: 'cs_agent',
        body: '可以，請選大罐',
        createdAt: 2000,
      });

      assert.equal(updated.status, 'replied');
      assert.equal(updated.replies.length, 1);
      assert.equal((await repo.findById('i1')).status, 'replied');
      assert.equal((await repo.listPending()).length, 0);
    },
  },
  {
    name: 'close：狀態改 closed',
    async run(repo) {
      await repo.create({ inquiryId: 'i1', customerId: 'c1', productId: 'p1', createdAt: 1000 });
      const closed = await repo.close('i1', { csAgentId: 'cs-1' });
      assert.equal(closed.status, 'closed');
      assert.equal(closed.csAgentId, 'cs-1');
    },
  },
  {
    name: '重複 inquiryId／找不到 → 錯誤；參數不合法 → TypeError',
    async run(repo) {
      await repo.create({ inquiryId: 'i1', customerId: 'c1', productId: 'p1', createdAt: 1000 });
      await assert.rejects(
        () => repo.create({ inquiryId: 'i1', customerId: 'c1', productId: 'p2' }),
        /已存在/,
      );
      await assert.rejects(() => repo.appendReply('missing', { body: 'x' }), /不存在/);
      await assert.rejects(() => repo.create(null), TypeError);
      await assert.rejects(() => repo.findById(''), TypeError);
    },
  },
];

module.exports = { cartCases, favoriteCases, inquiryCases };
