'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { authenticate } = require('../../../packages/entrypoint-kit/authenticate');
const {
  InMemoryCustomerRepository,
  InMemoryCsAgentRepository,
} = require('../../../packages/adapters');
const { buildTestContainer, TEST_USERS } = require('../../helpers/container');

function containerWith() {
  return buildTestContainer({
    userRepository: buildTestContainer().userRepository.seed(Object.values(TEST_USERS)),
  });
}

test('authenticate：三種失敗', async (t) => {
  await t.test('無 OPENID → UNAUTHENTICATED', async () => {
    const r = await authenticate({}, containerWith());
    assert.equal(r.ok, false);
    assert.equal(r.error.code, 'UNAUTHENTICATED');
  });

  await t.test('wxContext 為 undefined 也不爆', async () => {
    const r = await authenticate(undefined, containerWith());
    assert.equal(r.ok, false);
    assert.equal(r.error.code, 'UNAUTHENTICATED');
  });

  await t.test('查無使用者 → UNAUTHENTICATED', async () => {
    const r = await authenticate({ OPENID: 'nobody' }, containerWith());
    assert.equal(r.ok, false);
    assert.equal(r.error.code, 'UNAUTHENTICATED');
  });

  await t.test('帳號停用 → FORBIDDEN', async () => {
    const r = await authenticate({ OPENID: TEST_USERS.disabled.openid }, containerWith());
    assert.equal(r.ok, false);
    assert.equal(r.error.code, 'FORBIDDEN');
  });

  await t.test('⚠️「查無使用者」與「無 OPENID」訊息必須相同（防使用者列舉）', async () => {
    const a = await authenticate({}, containerWith());
    const b = await authenticate({ OPENID: 'nobody' }, containerWith());
    assert.equal(a.error.message, b.error.message);
    // details 也必須相同，否則可從細節反推
    assert.equal(a.error.details, b.error.details);
  });
});

test('authenticate：成功路徑', async (t) => {
  await t.test('回傳 actor 且帶正確角色', async () => {
    const r = await authenticate({ OPENID: TEST_USERS.csAgent.openid }, containerWith());
    assert.equal(r.ok, true);
    assert.equal(r.value.id, TEST_USERS.csAgent.id);
    assert.equal(r.value.role, 'cs_agent');
    assert.equal(r.value.openid, TEST_USERS.csAgent.openid);
  });

  await t.test('師傅的 technicianId 有帶出（OwnershipConstraint 需要）', async () => {
    const r = await authenticate({ OPENID: TEST_USERS.technician.openid }, containerWith());
    assert.equal(r.value.technicianId, 'tech-1');
  });

  await t.test('客服的 regions 有帶出（RegionConstraint 需要）', async () => {
    const r = await authenticate({ OPENID: TEST_USERS.csAgent.openid }, containerWith());
    assert.deepEqual(r.value.regions, ['440306']);
  });

  await t.test('缺漏欄位有安全的預設值，不會是 undefined', async () => {
    const r = await authenticate({ OPENID: TEST_USERS.customer.openid }, containerWith());
    assert.equal(r.value.technicianId, null);
    assert.equal(r.value.merchantId, 'platform');
    assert.deepEqual(r.value.regions, []);
    assert.equal(r.value.dailyRefundBudget, null);
  });

  await t.test('⚠️ 不判斷角色：任何角色都能通過身分驗證', async () => {
    // 角色能力是 AccessPolicy 的職責（docs/01 §4.7）。
    // 若 authenticate 開始判斷角色，這個測試會失敗。
    for (const key of ['customer', 'csAgent', 'technician', 'admin']) {
      const r = await authenticate({ OPENID: TEST_USERS[key].openid }, containerWith());
      assert.equal(r.ok, true, `${key} 應能通過身分驗證`);
    }
  });
});

test('authenticate：契約檢查', async (t) => {
  await t.test('缺少 userRepository 會拋錯（組裝錯誤要讓它爆）', async () => {
    await assert.rejects(() => authenticate({ OPENID: 'x' }, {}), TypeError);
  });
});

test('authenticate：解析業務識別碼（P5 路由需要）', async (t) => {
  await t.test('客戶的 customerId 由 customers 集合解析（OwnershipConstraint 用）', async () => {
    const customerRepository = new InMemoryCustomerRepository();
    await customerRepository.save({ customerId: 'cust-1', userId: TEST_USERS.customer.id });
    const container = buildTestContainer({
      userRepository: buildTestContainer().userRepository.seed(Object.values(TEST_USERS)),
      customerRepository,
    });

    const r = await authenticate({ OPENID: TEST_USERS.customer.openid }, container);
    assert.equal(r.ok, true);
    assert.equal(r.value.customerId, 'cust-1');
  });

  await t.test('客服的 csAgentId 由 cs_agents 集合解析（每日退款額度用）', async () => {
    const csAgentRepository = new InMemoryCsAgentRepository();
    await csAgentRepository.save({ csAgentId: 'cs-1', userId: TEST_USERS.csAgent.id });
    const container = buildTestContainer({
      userRepository: buildTestContainer().userRepository.seed(Object.values(TEST_USERS)),
      csAgentRepository,
    });

    const r = await authenticate({ OPENID: TEST_USERS.csAgent.openid }, container);
    assert.equal(r.value.csAgentId, 'cs-1');
  });

  await t.test('admin 的 permissions 有帶出（權限組 → 有效權限）', async () => {
    const admin = { ...TEST_USERS.admin, permissions: ['finance_manager'] };
    const container = buildTestContainer({
      userRepository: buildTestContainer().userRepository.seed([admin]),
    });

    const r = await authenticate({ OPENID: admin.openid }, container);
    assert.deepEqual(r.value.permissions, ['finance_manager']);
  });

  await t.test('沒有 customerRepository／csAgentRepository 時，安全回 null（不炸）', async () => {
    const r = await authenticate({ OPENID: TEST_USERS.customer.openid }, containerWith());
    assert.equal(r.value.customerId, null);
    assert.equal(r.value.csAgentId, null);
  });

  await t.test('使用者的 merchantId 會帶入 actor（多租戶）', async () => {
    const user = { ...TEST_USERS.technician, merchantId: 'merchant-a' };
    const container = buildTestContainer({
      userRepository: buildTestContainer().userRepository.seed([user]),
    });

    const r = await authenticate({ OPENID: user.openid }, container);
    assert.equal(r.value.merchantId, 'merchant-a');
  });
});
