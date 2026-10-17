'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { AuthenticateUseCase } = require('../../../packages/application/identity/AuthenticateUseCase');
const { InMemoryUserRepository } = require('../../../packages/adapters/inmemory/InMemoryUserRepository');

function makeUseCase() {
  const repo = new InMemoryUserRepository();
  repo.seed([
    { id: 'u1', openid: 'openid-1', roleType: 'customer', status: 'active' },
    { id: 'u2', openid: 'openid-2', roleType: 'technician', status: 'active', technicianId: 't1' },
    { id: 'u3', openid: 'openid-3', roleType: 'admin', status: 'active', permissions: ['admin.full'] },
    { id: 'u4', openid: 'openid-4', roleType: 'customer', status: 'disabled' },
    { id: 'u5', openid: 'openid-5', roleType: 'technician', status: 'active', technicianId: 't5', merchantId: 'merchant-a' },
  ]);
  return new AuthenticateUseCase({ userRepository: repo });
}

test('AuthenticateUseCase：第 1 層身分驗證', async (t) => {
  await t.test('成功 → actor 快照', async () => {
    const result = await makeUseCase().execute({ openid: 'openid-1' });
    assert.equal(result.ok, true);
    assert.equal(result.value.id, 'u1');
    assert.equal(result.value.role, 'customer');
    assert.equal(result.value.openid, 'openid-1');
  });

  await t.test('師傅帶出 technicianId 與預設 merchantId', async () => {
    const result = await makeUseCase().execute({ openid: 'openid-2' });
    assert.equal(result.value.technicianId, 't1');
    assert.equal(result.value.merchantId, 'platform');
  });

  await t.test('使用者的 merchantId 會帶入 actor（多租戶）', async () => {
    const result = await makeUseCase().execute({ openid: 'openid-5' });
    assert.equal(result.value.merchantId, 'merchant-a');
  });

  await t.test('admin 帶出權限組', async () => {
    const result = await makeUseCase().execute({ openid: 'openid-3' });
    assert.deepEqual(result.value.permissions, ['admin.full']);
  });

  await t.test('缺 openid → UNAUTHENTICATED', async () => {
    const result = await makeUseCase().execute({});
    assert.equal(result.ok, false);
    assert.equal(result.code, 'UNAUTHENTICATED');
  });

  await t.test('查無使用者 → UNAUTHENTICATED（不洩漏是否註冊）', async () => {
    const result = await makeUseCase().execute({ openid: 'unknown' });
    assert.equal(result.code, 'UNAUTHENTICATED');
  });

  await t.test('停用帳號 → FORBIDDEN', async () => {
    const result = await makeUseCase().execute({ openid: 'openid-4' });
    assert.equal(result.code, 'FORBIDDEN');
  });
});
