'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { toResponse } = require('../../../packages/entrypoint-kit/toResponse');
const { Result } = require('../../../packages/shared-kernel/Result');
const { InMemoryLoggerAdapter } = require('../../../packages/adapters');

test('toResponse：成功', async (t) => {
  await t.test('ok:true 帶 data', () => {
    const r = toResponse(Result.ok({ id: 'o1' }));
    assert.deepEqual(r, { ok: true, data: { id: 'o1' } });
  });

  await t.test('value 為 undefined 時 data 為 null（避免前端拿到 undefined）', () => {
    assert.deepEqual(toResponse(Result.ok(undefined)), { ok: true, data: null });
  });

  await t.test('value 為 0 / false / 空字串時不被誤判為空', () => {
    assert.deepEqual(toResponse(Result.ok(0)), { ok: true, data: 0 });
    assert.deepEqual(toResponse(Result.ok(false)), { ok: true, data: false });
    assert.deepEqual(toResponse(Result.ok('')), { ok: true, data: '' });
  });
});

test('toResponse：失敗', async (t) => {
  await t.test('帶出 code 與 message', () => {
    const r = toResponse(Result.forbidden('不能做'));
    assert.deepEqual(r, { ok: false, error: { code: 'FORBIDDEN', message: '不能做' } });
  });

  await t.test('各錯誤碼皆正確轉譯', () => {
    const cases = [
      [Result.unauthenticated(), 'UNAUTHENTICATED'],
      [Result.forbidden(), 'FORBIDDEN'],
      [Result.notFound(), 'NOT_FOUND'],
      [Result.conflict('x'), 'CONFLICT'],
      [Result.preconditionFailed('x'), 'PRECONDITION_FAILED'],
      [Result.upstreamFailed('x'), 'UPSTREAM_FAILED'],
    ];
    for (const [result, code] of cases) {
      assert.equal(toResponse(result).error.code, code);
    }
  });
});

test('toResponse：details 的洩漏控制', async (t) => {
  await t.test('VALIDATION 才回傳 details', () => {
    const r = toResponse(Result.validation('格式錯誤', { errors: [{ field: 'a' }] }));
    assert.deepEqual(r.error.details, { errors: [{ field: 'a' }] });
  });

  await t.test('⚠️ PRECONDITION_FAILED 不回傳 details（可能含內部狀態）', () => {
    const r = toResponse(Result.preconditionFailed('狀態不允許', { status: 'DISPUTED', orderId: 'o1' }));
    assert.equal('details' in r.error, false);
  });

  await t.test('⚠️ UPSTREAM_FAILED 不回傳 details（可能含支付商回應）', () => {
    const r = toResponse(Result.upstreamFailed('支付失敗', { raw: { mchid: 'secret' } }));
    assert.equal('details' in r.error, false);
  });

  await t.test('NOT_FOUND 不回傳 details', () => {
    const r = toResponse(Result.notFound('訂單不存在'));
    assert.equal('details' in r.error, false);
  });
});

test('toResponse：未預期例外', async (t) => {
  await t.test('⚠️ 不洩漏堆疊或原始訊息', () => {
    const err = new Error('ECONNREFUSED 10.0.0.5:3306');
    err.stack = 'at Database.connect (/internal/db.js:42)';
    const r = toResponse.error(err);

    assert.equal(r.ok, false);
    assert.equal(r.error.code, 'INTERNAL');
    assert.equal(r.error.message, '系統忙碌，請稍後再試');
    const serialized = JSON.stringify(r);
    assert.equal(serialized.includes('ECONNREFUSED'), false, '不得含原始錯誤訊息');
    assert.equal(serialized.includes('10.0.0.5'), false, '不得含內部位址');
    assert.equal(serialized.includes('db.js'), false, '不得含堆疊');
  });

  await t.test('有 logger 時錯誤進日誌，但不進回應', () => {
    const logger = new InMemoryLoggerAdapter();
    const err = new Error('boom');
    toResponse.error(err, logger);

    const entries = logger.findByLevel('error');
    assert.equal(entries.length, 1);
    assert.equal(entries[0].message, 'unhandled entrypoint error');
    assert.match(entries[0].error, /boom/);
  });

  await t.test('沒有 logger 也不會爆', () => {
    assert.equal(toResponse.error(new Error('x')).ok, false);
  });
});

test('toResponse：輔助方法', async (t) => {
  await t.test('unauthenticated / forbidden 的形狀一致', () => {
    assert.deepEqual(toResponse.unauthenticated(), {
      ok: false, error: { code: 'UNAUTHENTICATED', message: '請先登入' },
    });
    assert.deepEqual(toResponse.forbidden(), {
      ok: false, error: { code: 'FORBIDDEN', message: '無權限執行此操作' },
    });
  });

  await t.test('⚠️ 角色不足與資源不屬於自己用同一訊息（防探測）', () => {
    assert.equal(toResponse.forbidden().error.message, toResponse.forbidden().error.message);
    assert.match(toResponse.forbidden().error.message, /無權限/);
  });
});
