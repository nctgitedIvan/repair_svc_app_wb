'use strict';

/** 訂單聚合與明細 Repository 的契約案例（P2c-1）。 */

const assert = require('node:assert/strict');
const { ConcurrencyConflict } = require('@repair/shared-kernel/Errors');
const { makeOrder } = require('../helpers/order');

const orderCases = [
  {
    name: 'save／findById／findByOrderNo：聚合完整往返',
    async run(repo) {
      const order = makeOrder({ orderId: 'o1', orderNo: 'R20261017000001' });
      await repo.save(order);

      const byId = await repo.findById('o1');
      assert.equal(byId.id, 'o1');
      assert.equal(byId.orderNo.value, 'R20261017000001');
      assert.equal(byId.statusKey, 'PENDING_PAYMENT');
      assert.equal(byId.items.length, 2);
      assert.equal(byId.timeline.length, 1);
      assert.equal(byId.version, 0);

      const byNo = await repo.findByOrderNo('R20261017000001');
      assert.equal(byNo.id, 'o1');
    },
  },
  {
    name: '狀態變更後 save：version+1、timeline 追加',
    async run(repo) {
      const order = makeOrder({ orderId: 'o1', orderNo: 'R20261017000002' });
      await repo.save(order);

      order.markPaid({ at: order.createdAt + 1000 });
      await repo.save(order);

      const reloaded = await repo.findById('o1');
      assert.equal(reloaded.statusKey, 'PAID_PENDING_ASSIGN');
      assert.equal(reloaded.version, 1);
      assert.equal(reloaded.timeline.length, 2);
    },
  },
  {
    name: '⚠️ 樂觀鎖：版本不符 → ConcurrencyConflict',
    async run(repo) {
      const order = makeOrder({ orderId: 'o1', orderNo: 'R20261017000003' });
      await repo.save(order);
      await assert.rejects(() => repo.save(order), ConcurrencyConflict);
    },
  },
  {
    name: 'findExpiredUnpaid：只回 before 之前、PENDING_PAYMENT',
    async run(repo) {
      const old = makeOrder({ orderId: 'o1', orderNo: 'R20261017000004', createdAt: 1000 });
      const fresh = makeOrder({ orderId: 'o2', orderNo: 'R20261017000005', createdAt: 2000 });
      await repo.save(old);
      await repo.save(fresh);

      const result = await repo.findExpiredUnpaid(1500, 10);
      assert.deepEqual(result.map((o) => o.id), ['o1']);
    },
  },
  {
    name: 'findExpiredUnassigned：回 PAID_PENDING_ASSIGN／ASSIGNED_PENDING_ACCEPT',
    async run(repo) {
      const paid = makeOrder({ orderId: 'o1', orderNo: 'R20261017000006', createdAt: 1000, to: ['paid'] });
      const assigned = makeOrder({ orderId: 'o2', orderNo: 'R20261017000007', createdAt: 1000, to: ['paid', 'assigned'] });
      await repo.save(paid);
      await repo.save(assigned);

      const result = await repo.findExpiredUnassigned(2000, 10);
      assert.deepEqual(result.map((o) => o.id).sort(), ['o1', 'o2']);
    },
  },
  {
    name: '找不到 → null',
    async run(repo) {
      assert.equal(await repo.findById('missing'), null);
      assert.equal(await repo.findByOrderNo('missing'), null);
    },
  },
];

const orderItemCases = [
  {
    name: 'saveForOrder／listByOrderId 往返',
    async run(repo) {
      const order = makeOrder();
      const items = order.items.map((item) => item.toJSON());
      await repo.saveForOrder('o1', items);

      assert.deepEqual(await repo.listByOrderId('o1'), items);
    },
  },
  {
    name: '再次 saveForOrder 會覆蓋；空陣列清空',
    async run(repo) {
      const order = makeOrder();
      await repo.saveForOrder('o1', order.items.map((item) => item.toJSON()));
      await repo.saveForOrder('o1', []);
      assert.deepEqual(await repo.listByOrderId('o1'), []);
    },
  },
  {
    name: '找不到訂單明細 → 空陣列；參數不合法 → TypeError',
    async run(repo) {
      assert.deepEqual(await repo.listByOrderId('missing'), []);
      await assert.rejects(() => repo.listByOrderId(''), TypeError);
      await assert.rejects(() => repo.saveForOrder('o1', null), TypeError);
    },
  },
];

module.exports = { orderCases, orderItemCases };
