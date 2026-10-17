'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { Order } = require('../../../../packages/domain/order/Order');
const { makeOrder } = require('../../../helpers/order');

test('Order：merchantId 多租戶預留', async (t) => {
  await t.test('未指定時預設 platform', () => {
    const order = makeOrder();
    assert.equal(order.merchantId, 'platform');
  });

  await t.test('指定 merchantId 時保留', () => {
    const order = makeOrder({ merchantId: 'merchant-a' });
    assert.equal(order.merchantId, 'merchant-a');
  });

  await t.test('toPersistence／rehydrate 保留 merchantId', () => {
    const order = makeOrder({ merchantId: 'merchant-b' });
    const row = order.toPersistence();
    assert.equal(row.merchantId, 'merchant-b');

    const restored = Order.rehydrate(row);
    assert.equal(restored.merchantId, 'merchant-b');
  });

  await t.test('舊資料沒有 merchantId 時，rehydrate 預設 platform', () => {
    const row = makeOrder().toPersistence();
    delete row.merchantId;
    assert.equal(Order.rehydrate(row).merchantId, 'platform');
  });

  await t.test('toSnapshot 也帶 merchantId', () => {
    assert.equal(makeOrder({ merchantId: 'merchant-c' }).toSnapshot().merchantId, 'merchant-c');
  });
});
