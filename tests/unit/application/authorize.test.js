'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { authorize } = require('../../../packages/application/access/authorize');

const customer = { id: 'cust-1', role: 'customer' };
const technician = { id: 'usr-t1', role: 'technician', technicianId: 't1' };
const csAgent = { id: 'cs-1', role: 'cs_agent', regions: ['*'] };
const admin = { id: 'admin-1', role: 'admin', permissions: ['admin.full'] };

test('authorize：AccessPolicy 統一入口', async (t) => {
  await t.test('customer 可建立訂單', () => {
    assert.equal(authorize(customer, 'orders.create', {}), null);
  });

  await t.test('customer 不可派單', () => {
    const denied = authorize(customer, 'orders.assign', { order: {}, regionCode: 'north' });
    assert.ok(denied);
    assert.equal(denied.code, 'FORBIDDEN');
    assert.equal(denied.error.details.reason, 'ROLE_NOT_PERMITTED');
  });

  await t.test('⚠️ customer 支付：只能自己的 PENDING_PAYMENT', () => {
    const own = { order: { customerId: 'cust-1', statusValue: 10 } };
    assert.equal(authorize(customer, 'orders.pay', { ...own, targetStatus: 'PAID_PENDING_ASSIGN' }), null);

    const other = { order: { customerId: 'cust-2', statusValue: 10 } };
    const denied = authorize(customer, 'orders.pay', { ...other, targetStatus: 'PAID_PENDING_ASSIGN' });
    assert.equal(denied.error.details.reason, 'NOT_OWNER');
  });

  await t.test('⚠️ technician 只能接自己被指派的訂單', () => {
    const ok = {
      order: { customerId: 'cust-1', technicianId: 't1', statusValue: 30 },
      targetStatus: 'ACCEPTED_PENDING_VISIT',
    };
    assert.equal(authorize(technician, 'orders.accept', ok), null);

    const denied = authorize(technician, 'orders.accept', {
      order: { customerId: 'cust-1', technicianId: 't2', statusValue: 30 },
      targetStatus: 'ACCEPTED_PENDING_VISIT',
    });
    assert.equal(denied.error.details.reason, 'NOT_ASSIGNED_TECHNICIAN');
  });

  await t.test('cs_agent 可派單、不可執行分帳', () => {
    assert.equal(
      authorize(csAgent, 'orders.assign', {
        order: { statusValue: 20 },
        regionCode: 'north',
        targetStatus: 'ASSIGNED_PENDING_ACCEPT',
      }),
      null,
    );
    const denied = authorize(csAgent, 'settlement.execute', {});
    assert.equal(denied.code, 'FORBIDDEN');
  });

  await t.test('admin.full 可執行分帳', () => {
    assert.equal(authorize(admin, 'settlement.execute', {}), null);
  });
});
