'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { createHandler } = require('../../../packages/entrypoint-kit/createHandler');
const { Result } = require('../../../packages/shared-kernel/Result');
const { buildTestContainer, TEST_USERS } = require('../../helpers/container');

/** 測試用的假 Use Case —— 記錄被呼叫時收到的參數 */
class FakeUseCase {
  static get allowedRoles() {
    return ['cs_agent', 'admin'];
  }
  constructor(container) {
    this.container = container;
    FakeUseCase.lastContainer = container;
  }
  static lastArgs = null;
  async execute(args) {
    FakeUseCase.lastArgs = args;
    return Result.ok({ echo: args.orderId, by: args.actor.id, role: args.actor.role });
  }
}

/** 不做角色限制的 Use Case */
class OpenUseCase {
  static get allowedRoles() {
    return undefined;
  }
  constructor() {}
  async execute({ actor }) {
    return Result.ok({ role: actor.role });
  }
}

/** 會拋例外的 Use Case */
class ExplodingUseCase {
  static get allowedRoles() {
    return ['admin'];
  }
  constructor() {}
  async execute() {
    const err = new Error('DB exploded at 10.0.0.5');
    err.stack = 'at internal/db.js:1';
    throw err;
  }
}

const SCHEMA = { orderId: { type: 'string', required: true, maxLength: 64 } };

function makeHandler({ UseCase = FakeUseCase, openid = TEST_USERS.csAgent.openid, schema = SCHEMA, ...rest } = {}) {
  const container = buildTestContainer({
    userRepository: buildTestContainer().userRepository.seed(Object.values(TEST_USERS)),
  });
  return createHandler({
    schema,
    UseCase,
    container,
    getWxContext: () => ({ OPENID: openid }),
    ...rest,
  });
}

test('createHandler：四步驟鏈路', async (t) => {
  await t.test('① 校驗失敗 → 不進 authenticate，也不呼叫 Use Case', async () => {
    FakeUseCase.lastArgs = null;
    const main = makeHandler();
    const r = await main({});

    assert.equal(r.ok, false);
    assert.equal(r.error.code, 'VALIDATION');
    assert.equal(FakeUseCase.lastArgs, null, '校驗失敗不應呼叫 Use Case');
  });

  await t.test('② 未登入 → UNAUTHENTICATED', async () => {
    FakeUseCase.lastArgs = null;
    // ⚠️ 這裡必須用 null 而非 undefined：
    // makeHandler 的參數有預設值，傳 undefined 會觸發 JS 的預設參數機制
    // 而套用「客服」的 openid，測試就會變成「已登入」而失去意義。
    const main = makeHandler({ openid: null });
    const r = await main({ orderId: 'o1' });

    assert.equal(r.error.code, 'UNAUTHENTICATED');
    assert.equal(FakeUseCase.lastArgs, null);
  });

  await t.test('② 帳號停用 → FORBIDDEN', async () => {
    const main = makeHandler({ openid: TEST_USERS.disabled.openid });
    const r = await main({ orderId: 'o1' });
    assert.equal(r.error.code, 'FORBIDDEN');
  });

  await t.test("②' 角色不足 → FORBIDDEN（客戶呼叫客服專屬 Use Case）", async () => {
    FakeUseCase.lastArgs = null;
    const main = makeHandler({ openid: TEST_USERS.customer.openid });
    const r = await main({ orderId: 'o1' });

    assert.equal(r.error.code, 'FORBIDDEN');
    assert.equal(FakeUseCase.lastArgs, null, '角色不足不應呼叫 Use Case');
  });

  await t.test('③ 成功 → 呼叫 Use Case 並帶入 actor', async () => {
    const main = makeHandler();
    const r = await main({ orderId: 'o1' });

    assert.equal(r.ok, true);
    assert.deepEqual(r.data, { echo: 'o1', by: TEST_USERS.csAgent.id, role: 'cs_agent' });
    assert.equal(FakeUseCase.lastArgs.orderId, 'o1');
    assert.equal(FakeUseCase.lastArgs.actor.role, 'cs_agent');
  });

  await t.test('Use Case 有取得 container（constructor injection）', async () => {
    const main = makeHandler();
    await main({ orderId: 'o1' });
    assert.ok(FakeUseCase.lastContainer.orderRepository, 'Use Case 應收到 container');
  });

  await t.test('未知欄位在入口就被擋（不會傳進 Use Case）', async () => {
    const main = makeHandler();
    const r = await main({ orderId: 'o1', hacker: 'x' });
    assert.equal(r.error.code, 'VALIDATION');
  });

  await t.test('Use Case 未宣告 allowedRoles 時不限制角色', async () => {
    const main = makeHandler({ UseCase: OpenUseCase, openid: TEST_USERS.customer.openid });
    const r = await main({ orderId: 'o1' });
    assert.equal(r.ok, true);
    assert.equal(r.data.role, 'customer');
  });
});

test('createHandler：未預期例外', async (t) => {
  await t.test('⚠️ 例外被折成 INTERNAL，不洩漏內部資訊', async () => {
    const main = makeHandler({ UseCase: ExplodingUseCase, openid: TEST_USERS.admin.openid });
    const r = await main({ orderId: 'o1' });

    assert.equal(r.ok, false);
    assert.equal(r.error.code, 'INTERNAL');
    const serialized = JSON.stringify(r);
    assert.equal(serialized.includes('10.0.0.5'), false);
    assert.equal(serialized.includes('db.js'), false);
    assert.equal(serialized.includes('exploded'), false);
  });

  await t.test('例外會寫進 logger', async () => {
    const container = buildTestContainer({
      userRepository: buildTestContainer().userRepository.seed(Object.values(TEST_USERS)),
    });
    const main = createHandler({
      schema: SCHEMA,
      UseCase: ExplodingUseCase,
      container,
      getWxContext: () => ({ OPENID: TEST_USERS.admin.openid }),
      logger: container.logger,
    });
    await main({ orderId: 'o1' });
    assert.equal(container.logger.findByLevel('error').length, 1);
  });
});

test('createHandler：組裝錯誤要讓它爆（不是靜默失效）', async (t) => {
  const container = buildTestContainer();
  const base = { schema: SCHEMA, UseCase: FakeUseCase, container, getWxContext: () => ({}) };

  await t.test('缺 UseCase', () => {
    assert.throws(() => createHandler({ ...base, UseCase: undefined }), TypeError);
  });
  await t.test('缺 schema', () => {
    assert.throws(() => createHandler({ ...base, schema: undefined }), TypeError);
  });
  await t.test('缺 getWxContext', () => {
    assert.throws(() => createHandler({ ...base, getWxContext: undefined }), TypeError);
  });
  await t.test('缺 container', () => {
    assert.throws(() => createHandler({ ...base, container: undefined }), TypeError);
  });
  await t.test('完全沒給參數', () => {
    assert.throws(() => createHandler(), TypeError);
  });
});

test('createHandler：event 邊界', async (t) => {
  await t.test('event 為 undefined 時視為空物件，走校驗失敗而非崩潰', async () => {
    const main = makeHandler();
    const r = await main(undefined);
    assert.equal(r.error.code, 'VALIDATION');
  });

  await t.test('event 為 null 時同上', async () => {
    const main = makeHandler();
    const r = await main(null);
    assert.equal(r.error.code, 'VALIDATION');
  });
});
