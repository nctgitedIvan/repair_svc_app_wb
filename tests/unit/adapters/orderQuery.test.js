'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { InMemoryOrderQueryAdapter } = require('../../../packages/adapters/inmemory/InMemoryOrderQueryAdapter');
const { InMemoryOrderRepository } = require('../../../packages/adapters/inmemory/InMemoryOrderRepository');
const { InMemoryCustomerRepository } = require('../../../packages/adapters/inmemory/InMemoryCustomerRepository');
const { FixedClockAdapter } = require('../../../packages/adapters/time/FixedClockAdapter');
const { makeOrder } = require('../../helpers/order');
const { disclosureStartAt } = require('../../../packages/domain/order/policies/AddressDisclosurePolicy');

const ORDER_ID = 'order-1';
const CUSTOMER_ID = 'cust-1';

async function setup({ now }) {
  const orderRepository = new InMemoryOrderRepository();
  const customerRepository = new InMemoryCustomerRepository();
  await customerRepository.save({
    customerId: CUSTOMER_ID,
    userId: CUSTOMER_ID,
    name: '王小明',
    phone: '13812345678',
  });

  const order = makeOrder({ orderId: ORDER_ID, customerId: CUSTOMER_ID, to: ['paid', 'assigned'] });
  await orderRepository.save(order);

  const adapter = new InMemoryOrderQueryAdapter({
    orderRepository,
    customerRepository,
    clock: new FixedClockAdapter(now),
  });

  return { adapter, order };
}

test('OrderQueryPort：角色化查詢與脫敏', async (t) => {
  const order = makeOrder({ orderId: ORDER_ID, customerId: CUSTOMER_ID, to: ['paid', 'assigned'] });
  const before = disclosureStartAt(order.appointmentAt) - 1;
  const after = disclosureStartAt(order.appointmentAt) + 1;

  await t.test('customer 本人：完整地址與電話', async () => {
    const { adapter } = await setup({ now: before });
    const view = await adapter.findByIdForCustomer({ id: CUSTOMER_ID, role: 'customer' }, ORDER_ID);
    assert.equal(view.customerPhone, '13812345678');
    assert.equal(view.customerPhoneLevel, 'FULL');
    assert.equal(view.address.level, 'FULL');
    assert.equal(view.address.detailAddress, order.address.detailAddress);
  });

  await t.test('customer 他人：null（不以錯誤訊息洩漏存在性）', async () => {
    const { adapter } = await setup({ now: before });
    assert.equal(
      await adapter.findByIdForCustomer({ id: 'other', role: 'customer' }, ORDER_ID),
      null,
    );
  });

  await t.test('⚠️ technician 被指派、服務當日前：電話遮罩、地址只有區域', async () => {
    const { adapter } = await setup({ now: before });
    const view = await adapter.findByIdForTechnician(
      { id: 'usr-t1', role: 'technician', technicianId: 'tech-1' },
      ORDER_ID,
    );
    assert.equal(view.customerPhone, '138****5678');
    assert.equal(view.customerPhoneLevel, 'MASKED');
    assert.equal(view.address.level, 'DISTRICT');
    assert.equal(view.address.detailAddress, null);
  });

  await t.test('⚠️ technician 服務當日 08:00 後：地址完整、電話仍遮罩', async () => {
    const { adapter } = await setup({ now: after });
    const view = await adapter.findByIdForTechnician(
      { id: 'usr-t1', role: 'technician', technicianId: 'tech-1' },
      ORDER_ID,
    );
    assert.equal(view.address.level, 'FULL');
    assert.equal(view.address.detailAddress, order.address.detailAddress);
    assert.equal(view.customerPhone, '138****5678', '師傅電話永遠遮罩，沒有例外');
  });

  await t.test('非指派師傅：null', async () => {
    const { adapter } = await setup({ now: after });
    assert.equal(
      await adapter.findByIdForTechnician(
        { id: 'usr-t2', role: 'technician', technicianId: 'tech-2' },
        ORDER_ID,
      ),
      null,
    );
  });

  await t.test('cs_agent／admin：完整', async () => {
    const { adapter } = await setup({ now: before });
    const cs = await adapter.findByIdForCsAgent({ id: 'cs-1', role: 'cs_agent' }, ORDER_ID);
    const admin = await adapter.findByIdForAdmin({ id: 'admin-1', role: 'admin' }, ORDER_ID);
    assert.equal(cs.customerPhone, '13812345678');
    assert.equal(admin.address.level, 'FULL');
  });
});
