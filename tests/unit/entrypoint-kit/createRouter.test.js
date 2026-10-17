'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { createRouter } = require('../../../packages/entrypoint-kit/createRouter');
const { Result } = require('../../../packages/shared-kernel/Result');
const { buildTestContainer, TEST_USERS } = require('../../helpers/container');

/** 記錄呼叫參數的假 Use Case */
class EchoUseCase {
  static get allowedRoles() {
    return undefined;
  }

  constructor(container) {
    this.container = container;
  }

  async execute(args) {
    EchoUseCase.lastArgs = args;
    return Result.ok({ actionArgs: args, role: args.actor.role });
  }
}

/** 只允許管理員 */
class AdminOnlyUseCase {
  static get allowedRoles() {
    return ['admin'];
  }

  constructor() {}

  async execute() {
    return Result.ok({ ok: 'admin' });
  }
}

/** 會拋例外（驗證錯誤不得洩漏） */
class ExplodingUseCase {
  static get allowedRoles() {
    return undefined;
  }

  constructor() {}

  async execute() {
    const err = new Error('db password leaked at 10.0.0.5');
    err.stack = 'at internal/db.js:1';
    throw err;
  }
}

function makeRouter({ routes, openid = TEST_USERS.csAgent.openid } = {}) {
  const container = buildTestContainer({
    userRepository: buildTestContainer().userRepository.seed(Object.values(TEST_USERS)),
  });

  return {
    container,
    main: createRouter({
      routes: routes || {
        echo: {
          schema: {
            orderId: { type: 'string', required: true, maxLength: 64 },
            remark: { type: 'string', required: false, maxLength: 200 },
          },
          UseCase: EchoUseCase,
        },
      },
      container,
      getWxContext: () => ({ OPENID: openid }),
    }),
  };
}

test('createRouter：action 形狀', async (t) => {
  await t.test('缺少 action → VALIDATION', async () => {
    const { main } = makeRouter();
    const r = await main({ orderId: 'o1' });
    assert.equal(r.ok, false);
    assert.equal(r.error.code, 'VALIDATION');
  });

  await t.test('event 為 null → VALIDATION（不炸）', async () => {
    const { main } = makeRouter();
    const r = await main(null);
    assert.equal(r.error.code, 'VALIDATION');
  });

  await t.test('action 非字串 → VALIDATION', async () => {
    const { main } = makeRouter();
    const r = await main({ action: 123 });
    assert.equal(r.error.code, 'VALIDATION');
  });
});

test('createRouter：身分驗證優先於 action 枚舉', async (t) => {
  await t.test('未登入時，即使 action 不存在也回 UNAUTHENTICATED', async () => {
    const { main } = makeRouter({ openid: null });
    const r = await main({ action: 'nope' });
    assert.equal(r.error.code, 'UNAUTHENTICATED');
  });

  await t.test('已登入、action 不存在 → NOT_FOUND（訊息不列出可用 action）', async () => {
    const { main } = makeRouter();
    const r = await main({ action: 'nope' });
    assert.equal(r.error.code, 'NOT_FOUND');
    assert.equal('details' in r.error, false);
  });
});

test('createRouter：參數校驗', async (t) => {
  await t.test('缺少 route 宣告的必填欄位 → VALIDATION', async () => {
    const { main } = makeRouter();
    const r = await main({ action: 'echo' });
    assert.equal(r.error.code, 'VALIDATION');
    assert.equal(r.error.details.errors[0].field, 'orderId');
  });

  await t.test('未知欄位被拒絕（防越權），Use Case 不被呼叫', async () => {
    EchoUseCase.lastArgs = null;
    const { main } = makeRouter();
    const r = await main({ action: 'echo', orderId: 'o1', technicianId: 'hack' });
    assert.equal(r.error.code, 'VALIDATION');
    assert.equal(EchoUseCase.lastArgs, null, '校驗失敗時不得呼叫 Use Case');
  });

  await t.test('action 本身不會傳進 Use Case', async () => {
    EchoUseCase.lastArgs = null;
    const { main } = makeRouter();
    const r = await main({ action: 'echo', orderId: 'o1' });
    assert.equal(r.ok, true);
    assert.equal('action' in EchoUseCase.lastArgs, false);
  });
});

test('createRouter：角色與成功路徑', async (t) => {
  await t.test('Use Case 宣告 allowedRoles 時，角色不符 → FORBIDDEN', async () => {
    const { main } = makeRouter({
      routes: { 'admin.only': { schema: {}, UseCase: AdminOnlyUseCase } },
      openid: TEST_USERS.csAgent.openid,
    });
    const r = await main({ action: 'admin.only' });
    assert.equal(r.error.code, 'FORBIDDEN');
  });

  await t.test('成功時帶入 actor 與 openid，回傳統一格式', async () => {
    EchoUseCase.lastArgs = null;
    const { main } = makeRouter();
    const r = await main({ action: 'echo', orderId: 'o1', remark: 'ok' });

    assert.equal(r.ok, true);
    assert.equal(EchoUseCase.lastArgs.orderId, 'o1');
    assert.equal(EchoUseCase.lastArgs.remark, 'ok');
    assert.equal(EchoUseCase.lastArgs.actor.id, TEST_USERS.csAgent.id);
    assert.equal(EchoUseCase.lastArgs.openid, TEST_USERS.csAgent.openid);
    assert.equal(r.data.role, 'cs_agent');
  });

  await t.test('payload 不能覆寫 actor／openid', async () => {
    EchoUseCase.lastArgs = null;
    const { main } = makeRouter({
      routes: {
        echo: { schema: { actor: { type: 'any' }, openid: { type: 'string' } }, UseCase: EchoUseCase },
      },
    });
    await main({ action: 'echo', actor: { id: 'hacker', role: 'admin' }, openid: 'hacker' });

    assert.equal(EchoUseCase.lastArgs.actor.id, TEST_USERS.csAgent.id);
    assert.equal(EchoUseCase.lastArgs.actor.role, 'cs_agent');
    assert.equal(EchoUseCase.lastArgs.openid, TEST_USERS.csAgent.openid);
  });
});

test('createRouter：未預期例外不洩漏', async (t) => {
  await t.test('回 INTERNAL，且不含堆疊或內部訊息', async () => {
    const { main } = makeRouter({
      routes: { boom: { schema: {}, UseCase: ExplodingUseCase } },
    });
    const r = await main({ action: 'boom' });
    assert.equal(r.error.code, 'INTERNAL');
    assert.equal(r.error.message, '系統忙碌，請稍後再試');
    assert.equal(JSON.stringify(r).includes('10.0.0.5'), false);
    assert.equal(JSON.stringify(r).includes('db.js'), false);
  });
});
