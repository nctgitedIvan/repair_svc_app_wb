'use strict';

/**
 * MaskedPhone 測試。
 *
 * 這組測試的核心不是「遮罩字串對不對」，而是：
 * **有沒有任何方法可以取回完整號碼。**
 * 若這個保證不成立，「師傅端看不到客戶完整手機號」就只是口號。
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const { MaskedPhone, CN_MOBILE_RE } = require('../../../../packages/domain/shared/MaskedPhone');

test('遮罩規則', async (t) => {
  await t.test('11 位大陸手機 → 前 3 後 4', () => {
    assert.equal(MaskedPhone.of('13812345678').masked, '138****5678');
    assert.equal(MaskedPhone.of('13900001111').masked, '139****1111');
    assert.equal(MaskedPhone.of('18600001234').masked, '186****1234');
  });

  await t.test('已遮罩者原樣回傳（**冪等**，不會二次遮罩）', () => {
    assert.equal(MaskedPhone.of('138****1234').masked, '138****1234');
    assert.equal(MaskedPhone.of(MaskedPhone.of('13812345678').masked).masked, '138****5678');
  });

  await t.test('非標準格式保守遮罩（寧可遮太多）', () => {
    const masked = MaskedPhone.of('0755-12345678').masked;
    assert.ok(masked.includes('*'), '必須含遮罩字元');
    assert.ok(masked.length === '0755-12345678'.length, '長度不變，避免洩漏資訊量以外的線索');
  });

  await t.test('極短輸入不爆', () => {
    assert.equal(MaskedPhone.of('12').masked, '**');
    assert.equal(MaskedPhone.of('1').masked, '*');
  });

  await t.test('拒絕空值', () => {
    assert.throws(() => MaskedPhone.of(''), Error);
    assert.throws(() => MaskedPhone.of(null), Error);
    assert.throws(() => MaskedPhone.of(undefined), Error);
  });
});

test('⚠️ 型別層保證：無法取回完整號碼', async (t) => {
  await t.test('fromMasked 傳入完整號碼也會被遮罩（不能藉此繞過）', () => {
    assert.equal(MaskedPhone.fromMasked('13812345678').masked, '138****5678');
  });

  await t.test('對外唯一欄位是 masked', () => {
    const mp = MaskedPhone.of('13812345678');
    assert.deepEqual(Object.keys(mp.toJSON()), ['masked']);
  });

  await t.test('沒有 unmask / raw / value / phone 等方法', () => {
    const mp = MaskedPhone.of('13812345678');
    for (const forbidden of ['unmask', 'raw', 'value', 'phone', 'full', 'original']) {
      assert.equal(forbidden in mp, false, `不應存在 ${forbidden}`);
    }
  });

  await t.test('序列化後的 JSON 不含完整號碼', () => {
    const json = JSON.stringify(MaskedPhone.of('13812345678'));
    assert.equal(/1[3-9]\d{9}/.test(json), false);
    assert.match(json, /\*{4}/);
  });

  await t.test('列舉自身屬性也取不到完整號碼', () => {
    const mp = MaskedPhone.of('13812345678');
    const dump = JSON.stringify({ ...mp, ...mp.toJSON() });
    assert.equal(dump.includes('13812345678'), false);
  });
});

test('值物件語意', async (t) => {
  await t.test('同號碼相等、不同號碼不等', () => {
    assert.ok(MaskedPhone.of('13812345678').equals(MaskedPhone.of('13812345678')));
    assert.ok(!MaskedPhone.of('13812345678').equals(MaskedPhone.of('13900001111')));
  });

  await t.test('與其他值物件型別不相等（即使內容相同）', () => {
    const { OrderNo } = require('../../../../packages/domain/shared/OrderNo');
    const masked = MaskedPhone.of('13812345678');
    assert.equal(masked.equals('138****5678'), false);
    assert.equal(masked.equals({ masked: '138****5678' }), false);
    assert.equal(masked.equals(new OrderNo('R20261016000001')), false);
  });

  await t.test('toString 不含完整號碼', () => {
    assert.equal(MaskedPhone.of('13812345678').toString().includes('13812345678'), false);
  });
});

test('CN_MOBILE_RE 供其他模組共用', async (t) => {
  await t.test('正確識別大陸手機號', () => {
    assert.ok(CN_MOBILE_RE.test('13812345678'));
    assert.ok(CN_MOBILE_RE.test('19912345678'));
    assert.ok(!CN_MOBILE_RE.test('12812345678'), '第二位不得為 2');
    assert.ok(!CN_MOBILE_RE.test('1381234567'), '不足 11 位');
    assert.ok(!CN_MOBILE_RE.test('138123456789'), '超過 11 位');
  });
});
