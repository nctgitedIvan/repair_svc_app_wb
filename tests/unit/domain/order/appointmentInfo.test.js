'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { AppointmentInfo, MAX_DESCRIPTION_LENGTH } = require('../../../../packages/domain/order/AppointmentInfo');
const { Order } = require('../../../../packages/domain/order/Order');
const { makeOrder } = require('../../../helpers/order');

const NOW = 1_700_000_000_000;

function info(over = {}) {
  return new AppointmentInfo({
    appointmentAt: NOW + 86_400_000,
    address: '廣東省深圳市寶安區沙井街道中心路28號3棟5B',
    contactName: '王小明',
    contactPhone: '+86 138 1234 5678',
    description: '冷氣不冷，請攜帶冷媒。',
    mediaUrls: ['wxfile://photo-1.jpg', 'audio:3'],
    ...over,
  });
}

test('AppointmentInfo：建立與欄位', async (t) => {
  await t.test('合法建立，手機正規化為 formatted', () => {
    const value = info({ contactPhone: '853 6612 3456' });
    assert.equal(value.contactPhone, '+853 6612 3456');
    assert.equal(value.appointmentAt, NOW + 86_400_000);
    assert.deepEqual(value.mediaUrls, ['wxfile://photo-1.jpg', 'audio:3']);
  });

  await t.test('空描述與空附件是合法的', () => {
    const value = info({ description: '', mediaUrls: [] });
    assert.equal(value.description, '');
    assert.deepEqual(value.mediaUrls, []);
  });

  await t.test('手機格式不正確 → 拋錯', () => {
    assert.throws(() => info({ contactPhone: '123' }), /手機|格式/);
  });

  await t.test('問題描述超過 500 字 → 拋錯', () => {
    assert.throws(
      () => info({ description: '字'.repeat(MAX_DESCRIPTION_LENGTH + 1) }),
      /問題描述/,
    );
  });

  await t.test('附件超過 9 個或不是字串 → 拋錯', () => {
    assert.throws(
      () => info({ mediaUrls: Array.from({ length: 10 }, (_, i) => `f-${i}`) }),
      /附件/,
    );
    assert.throws(() => info({ mediaUrls: ['ok', 123] }), /字串/);
  });

  await t.test('toJSON／rehydrate 往返', () => {
    const value = info();
    const row = value.toJSON();
    const restored = AppointmentInfo.rehydrate(row);
    assert.deepEqual(restored.toJSON(), row);
  });
});

test('Order：appointmentInfo 持久化', async (t) => {
  await t.test('建立時可帶入，toPersistence／rehydrate 保留', () => {
    const appointmentInfo = info();
    const order = makeOrder({ appointmentInfo });
    const row = order.toPersistence();

    assert.deepEqual(row.appointmentInfo, appointmentInfo.toJSON());

    const restored = Order.rehydrate(row);
    assert.deepEqual(restored.appointmentInfo.toJSON(), appointmentInfo.toJSON());
    assert.equal(restored.appointmentInfo instanceof AppointmentInfo, true);
  });

  await t.test('未提供時為 null（舊訂單相容）', () => {
    const order = makeOrder();
    assert.equal(order.appointmentInfo, null);
    assert.equal(order.toPersistence().appointmentInfo, null);
  });

  await t.test('toSnapshot 也帶 appointmentInfo', () => {
    const appointmentInfo = info();
    const order = makeOrder({ appointmentInfo });
    assert.deepEqual(order.toSnapshot().appointmentInfo, appointmentInfo.toJSON());
  });
});
