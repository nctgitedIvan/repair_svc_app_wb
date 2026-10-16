'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { validate } = require('../../../packages/entrypoint-kit/validate');

const SCHEMA = {
  orderId: { type: 'string', required: true, maxLength: 64 },
  remark: { type: 'string', maxLength: 200 },
  page: { type: 'integer', min: 1, max: 100, default: 1 },
  status: { type: 'string', enum: ['active', 'closed'] },
};

test('validate：必填與選填', async (t) => {
  await t.test('缺少必填 → VALIDATION 且指出欄位', () => {
    const r = validate({}, SCHEMA);
    assert.equal(r.ok, false);
    assert.equal(r.code, 'VALIDATION');
    assert.deepEqual(r.error.details.errors.map((e) => e.field), ['orderId']);
  });

  await t.test('空字串視為未提供', () => {
    assert.equal(validate({ orderId: '' }, SCHEMA).ok, false);
  });

  await t.test('null 視為未提供', () => {
    assert.equal(validate({ orderId: null }, SCHEMA).ok, false);
  });

  await t.test('選填未提供時套用 default', () => {
    const r = validate({ orderId: 'o1' }, SCHEMA);
    assert.equal(r.ok, true);
    assert.equal(r.value.page, 1);
    assert.equal('remark' in r.value, false, '沒有 default 的選填欄位不應出現');
  });

  await t.test('合法輸入通過並只保留 schema 宣告的欄位', () => {
    const r = validate({ orderId: 'o1', remark: 'ok', page: 3, status: 'active' }, SCHEMA);
    assert.equal(r.ok, true);
    assert.deepEqual(r.value, { orderId: 'o1', remark: 'ok', page: 3, status: 'active' });
  });
});

test('validate：未知欄位（防越權）', async (t) => {
  await t.test('預設拒絕未知欄位', () => {
    const r = validate({ orderId: 'o1', technicianId: 'hack' }, SCHEMA);
    assert.equal(r.ok, false);
    assert.equal(r.error.details.errors[0].rule, 'unknown');
    assert.match(r.error.details.errors[0].message, /technicianId/);
  });

  await t.test('rejectUnknown:false 時改為忽略', () => {
    const r = validate({ orderId: 'o1', extra: 'x' }, SCHEMA, { rejectUnknown: false });
    assert.equal(r.ok, true);
    assert.equal('extra' in r.value, false, '未知欄位應被丟棄而非保留');
  });
});

test('validate：型別', async (t) => {
  const cases = [
    [{ v: 'str' }, 'string', true],
    [{ v: 1 }, 'string', false],
    [{ v: 1 }, 'number', true],
    [{ v: NaN }, 'number', false],
    [{ v: 1 }, 'integer', true],
    [{ v: 1.5 }, 'integer', false],
    [{ v: true }, 'boolean', true],
    [{ v: [] }, 'array', true],
    [{ v: {} }, 'object', true],
    [{ v: [] }, 'object', false],
    // null 一律視為「未提供」，即使型別是 any 也一樣 ——
    // 因為 required 的語意是「有沒有給」，而 null 等於沒給。
    // 若需要「可為 null」的欄位，應使用 required:false 並讓 default 為 null。
    [{ v: null }, 'any', false],
    [{ v: 'ok' }, 'any', true],
  ];
  for (const [input, type, expected] of cases) {
    await t.test(`${JSON.stringify(input)} 對 ${type} → ${expected}`, () => {
      const r = validate(input, { v: { type, required: true } });
      assert.equal(r.ok, expected);
    });
  }

  await t.test('未知型別會拋錯（schema 寫錯要讓它爆）', () => {
    assert.throws(() => validate({ v: 1 }, { v: { type: 'nope', required: true } }), TypeError);
  });
});

test('validate：長度、範圍、枚舉', async (t) => {
  await t.test('maxLength', () => {
    assert.equal(validate({ orderId: 'a'.repeat(64) }, SCHEMA).ok, true);
    assert.equal(validate({ orderId: 'a'.repeat(65) }, SCHEMA).ok, false);
  });

  await t.test('minLength', () => {
    const schema = { v: { type: 'string', required: true, minLength: 3 } };
    assert.equal(validate({ v: 'ab' }, schema).ok, false);
    assert.equal(validate({ v: 'abc' }, schema).ok, true);
  });

  await t.test('min / max', () => {
    assert.equal(validate({ orderId: 'o', page: 0 }, SCHEMA).ok, false);
    assert.equal(validate({ orderId: 'o', page: 101 }, SCHEMA).ok, false);
    assert.equal(validate({ orderId: 'o', page: 100 }, SCHEMA).ok, true);
  });

  await t.test('enum', () => {
    assert.equal(validate({ orderId: 'o', status: 'active' }, SCHEMA).ok, true);
    assert.equal(validate({ orderId: 'o', status: 'bogus' }, SCHEMA).ok, false);
  });

  await t.test('pattern', () => {
    const schema = { no: { type: 'string', required: true, pattern: /^R\d{6}$/ } };
    assert.equal(validate({ no: 'R123456' }, schema).ok, true);
    assert.equal(validate({ no: 'X123456' }, schema).ok, false);
  });

  await t.test('自訂校驗回傳字串即為錯誤訊息', () => {
    const schema = { v: { type: 'string', required: true, validate: (x) => (x === 'ok' ? true : '必須是 ok') } };
    const r = validate({ v: 'no' }, schema);
    assert.equal(r.ok, false);
    assert.equal(r.error.details.errors[0].message, '必須是 ok');
  });
});

test('validate：輸入本身不是物件', async (t) => {
  for (const bad of [null, undefined, 'str', 42, []]) {
    await t.test(`${JSON.stringify(bad)} → 拒絕`, () => {
      const r = validate(bad, SCHEMA);
      assert.equal(r.ok, false);
      assert.equal(r.code, 'VALIDATION');
    });
  }

  await t.test('一次回報多個錯誤（不是遇到第一個就停）', () => {
    const r = validate({ page: 999, status: 'x' }, SCHEMA);
    assert.equal(r.ok, false);
    const fields = r.error.details.errors.map((e) => e.field).sort();
    assert.deepEqual(fields, ['orderId', 'page', 'status']);
  });
});
