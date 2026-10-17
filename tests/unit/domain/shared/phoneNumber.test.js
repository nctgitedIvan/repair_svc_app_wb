'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { PhoneNumber, COUNTRY_CODE } = require('../../../../packages/domain/shared/PhoneNumber');

test('PhoneNumber：澳門與大陸手機', async (t) => {
  await t.test('澳門：853 + 8 位', () => {
    const phone = PhoneNumber.of('+85366123456');
    assert.equal(phone.countryCode, COUNTRY_CODE.MACAU);
    assert.equal(phone.nationalNumber, '66123456');
    assert.equal(phone.e164, '+85366123456');
    assert.equal(phone.formatted, '+853 6612 3456');
    assert.equal(phone.masked, '853 66** ****');
  });

  await t.test('大陸：86 + 11 位', () => {
    const phone = PhoneNumber.of('+8613812345678');
    assert.equal(phone.countryCode, COUNTRY_CODE.MAINLAND);
    assert.equal(phone.nationalNumber, '13812345678');
    assert.equal(phone.e164, '+8613812345678');
    assert.equal(phone.formatted, '+86 138 1234 5678');
    assert.equal(phone.masked, '138 **** 5678');
  });

  await t.test('純 11 位視為大陸', () => {
    const phone = PhoneNumber.of('13900001111');
    assert.equal(phone.countryCode, COUNTRY_CODE.MAINLAND);
    assert.equal(phone.e164, '+8613900001111');
  });

  await t.test('容忍 +、空白、連字號', () => {
    assert.equal(PhoneNumber.of('853 6612 3456').e164, '+85366123456');
    assert.equal(PhoneNumber.of('+86 138-1234-5678').e164, '+8613812345678');
    assert.equal(PhoneNumber.of('86 138 1234 5678').e164, '+8613812345678');
  });

  await t.test('不合法格式 → InvariantViolation', () => {
    assert.throws(() => PhoneNumber.of(''), /PhoneNumber/);
    assert.throws(() => PhoneNumber.of('12345678'), /澳門手機格式|大陸手機格式/);
    assert.throws(() => PhoneNumber.of('+8531234'), /澳門手機格式/);
    assert.throws(() => PhoneNumber.of('+8612812345678'), /大陸手機格式/);
    assert.throws(() => PhoneNumber.of('+861381234567'), /大陸手機格式/);
  });

  await t.test('值物件相等', () => {
    assert.ok(PhoneNumber.of('13812345678').equals(PhoneNumber.of('+8613812345678')));
    assert.ok(!PhoneNumber.of('13812345678').equals(PhoneNumber.of('+85366123456')));
  });
});
