'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const frontendPhone = require('../../../utils/phone');
const { PhoneNumber } = require('../../../packages/domain/shared/PhoneNumber');
const { MaskedPhone } = require('../../../packages/domain/shared/MaskedPhone');

const SAMPLES = [
  '13812345678',
  '+8613812345678',
  '86 138 1234 5678',
  '+85366123456',
  '853 6612 3456',
];

test('前端 phone 工具：格式與遮罩', async (t) => {
  await t.test('大陸', () => {
    const parsed = frontendPhone.parsePhone('13812345678');
    assert.equal(parsed.countryCode, '86');
    assert.equal(parsed.formatted, '+86 138 1234 5678');
    assert.equal(parsed.masked, '138 **** 5678');
  });

  await t.test('澳門', () => {
    const parsed = frontendPhone.parsePhone('+85366123456');
    assert.equal(parsed.countryCode, '853');
    assert.equal(parsed.formatted, '+853 6612 3456');
    assert.equal(parsed.masked, '853 66** ****');
  });

  await t.test('不合法格式', () => {
    assert.equal(frontendPhone.parsePhone('0755-12345678'), null);
    assert.equal(frontendPhone.parsePhone('12345678'), null);
    assert.equal(frontendPhone.isValidPhone(''), false);
  });
});

test('⚠️ 前端工具與 domain 規則一致', async (t) => {
  await t.test('格式化與遮罩輸出一致', () => {
    for (const sample of SAMPLES) {
      const domain = PhoneNumber.of(sample);
      const frontend = frontendPhone.parsePhone(sample);
      assert.equal(frontend.formatted, domain.formatted, sample);
      assert.equal(frontend.e164, domain.e164, sample);
      assert.equal(MaskedPhone.of(sample).masked, frontend.masked, sample);
    }
  });
});
