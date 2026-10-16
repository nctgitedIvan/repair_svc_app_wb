'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  DomainError,
  InvariantViolation,
  IllegalStateTransition,
  NotFoundError,
  ConcurrencyConflict,
  isRetryable,
} = require('../../../packages/shared-kernel/Errors');

test('錯誤型別階層', async (t) => {
  await t.test('全部繼承 DomainError 與 Error', () => {
    const errors = [
      new InvariantViolation('x'),
      new IllegalStateTransition('A', 'B'),
      new NotFoundError('Order', 'o1'),
      new ConcurrencyConflict('cs_agents', 1, 2),
    ];
    for (const e of errors) {
      assert.ok(e instanceof DomainError, `${e.name} 應繼承 DomainError`);
      assert.ok(e instanceof Error, `${e.name} 應繼承 Error`);
    }
  });

  await t.test('每個型別有自己的 code', () => {
    assert.equal(new InvariantViolation('x').code, 'INVARIANT_VIOLATION');
    assert.equal(new IllegalStateTransition('A', 'B').code, 'ILLEGAL_STATE_TRANSITION');
    assert.equal(new NotFoundError('Order', 'o1').code, 'NOT_FOUND');
    assert.equal(new ConcurrencyConflict('x', 1, 2).code, 'CONCURRENCY_CONFLICT');
  });

  await t.test('name 反映實際型別（不是一律 Error）', () => {
    assert.equal(new InvariantViolation('x').name, 'InvariantViolation');
    assert.equal(new NotFoundError('Order', 'o1').name, 'NotFoundError');
  });
});

test('IllegalStateTransition：帶出前後狀態', async (t) => {
  await t.test('接受狀態物件並取其 key', () => {
    const e = new IllegalStateTransition({ key: 'PENDING_PAYMENT' }, { key: 'COMPLETED' });
    assert.equal(e.from, 'PENDING_PAYMENT');
    assert.equal(e.to, 'COMPLETED');
    assert.match(e.message, /PENDING_PAYMENT → COMPLETED/);
  });

  await t.test('接受字串', () => {
    const e = new IllegalStateTransition('A', 'B');
    assert.equal(e.from, 'A');
    assert.equal(e.to, 'B');
  });

  await t.test('接受 { value } 形狀', () => {
    const e = new IllegalStateTransition({ value: 10 }, { value: 70 });
    assert.equal(e.from, '10');
    assert.equal(e.to, '70');
  });

  await t.test('接受 null 不爆', () => {
    const e = new IllegalStateTransition(null, undefined);
    assert.equal(e.from, 'null');
    assert.equal(e.to, 'undefined');
  });
});

test('ConcurrencyConflict：可重試', async (t) => {
  await t.test('標記 retryable', () => {
    const e = new ConcurrencyConflict('cs_agents', 1, 2);
    assert.equal(e.retryable, true);
    assert.equal(e.details.expectedVersion, 1);
    assert.equal(e.details.actualVersion, 2);
  });
});

test('isRetryable', async (t) => {
  await t.test('ConcurrencyConflict 可重試', () => {
    assert.equal(isRetryable(new ConcurrencyConflict('x', 1, 2)), true);
  });

  await t.test('一般領域錯誤不可重試', () => {
    assert.equal(isRetryable(new NotFoundError('Order', 'o1')), false);
    assert.equal(isRetryable(new InvariantViolation('x')), false);
    assert.equal(isRetryable(new IllegalStateTransition('A', 'B')), false);
  });

  await t.test('外部注入的 retryable 錯誤也算（如結算逾時）', () => {
    const err = new Error('timeout');
    err.code = 'TIMEOUT';
    err.retryable = true;
    assert.equal(isRetryable(err), true);
  });

  await t.test('null / undefined 安全', () => {
    assert.equal(isRetryable(null), false);
    assert.equal(isRetryable(undefined), false);
  });
});

test('toLogObject：日誌用物件不含 details', async (t) => {
  await t.test('只帶 name / code / message', () => {
    const e = new ConcurrencyConflict('cs_agents', 1, 2);
    const log = e.toLogObject();
    assert.deepEqual(Object.keys(log).sort(), ['code', 'message', 'name']);
    assert.equal('details' in log, false, 'details 可能含內部識別碼，不應直接進日誌');
  });
});
