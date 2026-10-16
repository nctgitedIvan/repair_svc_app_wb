'use strict';

/**
 * canonicalJSON 的**確定性**測試。
 *
 * 為什麼這組測試特別重要：它是稽核哈希鏈的基礎。
 * 若序列化不確定，同一筆未被篡改的資料會算出不同 hash
 * → 稽核鏈**誤報斷點** → 真正被篡改時就沒人相信告警了。
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const { canonicalJSON } = require('../../../../packages/domain/shared/canonicalJSON');

test('確定性：與鍵的插入順序無關', async (t) => {
  await t.test('平坦物件', () => {
    assert.equal(canonicalJSON({ b: 1, a: 2 }), canonicalJSON({ a: 2, b: 1 }));
  });

  await t.test('巢狀物件', () => {
    const a = { z: { d: 1, c: 2 }, a: [{ y: 1, x: 2 }] };
    const b = { a: [{ x: 2, y: 1 }], z: { c: 2, d: 1 } };
    assert.equal(canonicalJSON(a), canonicalJSON(b));
  });

  await t.test('鍵的排序是字典序（不是插入序、也不是數值序）', () => {
    assert.equal(canonicalJSON({ b: 1, a: 2, C: 3 }), '{"C":3,"a":2,"b":1}');
  });

  await t.test('陣列順序**有意義**，不得排序', () => {
    assert.notEqual(canonicalJSON([1, 2]), canonicalJSON([2, 1]));
  });
});

test('型別敏感：不得把不同型別序列化成同一字串', async (t) => {
  await t.test('數字與字串不同', () => {
    assert.notEqual(canonicalJSON({ n: 1 }), canonicalJSON({ n: '1' }));
  });

  await t.test('null 與 undefined 屬性的處理', () => {
    assert.equal(canonicalJSON({ a: null }), '{"a":null}');
    assert.equal(canonicalJSON({ a: undefined }), '{}', 'undefined 屬性應被略過');
    assert.equal(canonicalJSON({ a: null }), canonicalJSON({ a: undefined, b: null }).replace('{"b"', '{"a"'));
  });

  await t.test('true/false 與字串不同', () => {
    assert.notEqual(canonicalJSON({ b: true }), canonicalJSON({ b: 'true' }));
  });

  await t.test('-0 與 0 序列化相同（避免平台差異）', () => {
    assert.equal(canonicalJSON({ n: -0 }), canonicalJSON({ n: 0 }));
  });
});

test('拒絕會產生不穩定結果的輸入', async (t) => {
  await t.test('function', () => {
    assert.throws(() => canonicalJSON({ fn: () => {} }), TypeError);
  });
  await t.test('bigint', () => {
    assert.throws(() => canonicalJSON({ n: 1n }), TypeError);
  });
  await t.test('NaN / Infinity', () => {
    assert.throws(() => canonicalJSON({ n: NaN }), TypeError);
    assert.throws(() => canonicalJSON({ n: Infinity }), TypeError);
  });

  await t.test('⚠️ Date —— 必須擋下，否則會出現「時間有兩種表示法」', () => {
    assert.throws(() => canonicalJSON(new Date()), TypeError);
    assert.throws(() => canonicalJSON({ t: new Date(1700000000000) }), TypeError, '巢狀也要擋');
  });

  await t.test('Date 的錯誤訊息要指出正確做法', () => {
    try {
      canonicalJSON({ t: new Date() });
      assert.fail('應該拋錯');
    } catch (err) {
      assert.match(err.message, /毫秒整數/);
    }
  });

  await t.test('無 toJSON 的 class 實例（序列化會遺漏私有狀態 → 危險）', () => {
    class Sneaky {
      #secret = 1;
      get secret() {
        return this.#secret;
      }
    }
    assert.throws(() => canonicalJSON(new Sneaky()), TypeError);
  });

  await t.test('有 toJSON 的物件允許（值物件靠這個控制序列化形狀）', () => {
    const vo = { toJSON: () => ({ v: 1 }) };
    assert.equal(canonicalJSON(vo), '{"v":1}');
  });
});

test('實用情境：模擬稽核條目的雜湊穩定性', async (t) => {
  const entry = {
    orderId: 'o1',
    action: 'AssignOrder',
    before: { status: 20, technicianId: null },
    after: { status: 30, technicianId: 'tech-1' },
    at: 1_700_000_000_000,
  };

  await t.test('重建同一筆資料（鍵順序不同）→ 同一字串', () => {
    const rebuilt = {
      at: 1_700_000_000_000,
      after: { technicianId: 'tech-1', status: 30 },
      before: { technicianId: null, status: 20 },
      action: 'AssignOrder',
      orderId: 'o1',
    };
    assert.equal(canonicalJSON(entry), canonicalJSON(rebuilt));
  });

  await t.test('改一個欄位 → 字串必須改變（否則篡改偵測不到）', () => {
    const tampered = JSON.parse(JSON.stringify(entry));
    tampered.after.status = 31;
    assert.notEqual(canonicalJSON(entry), canonicalJSON(tampered));
  });

  await t.test('字串與數字型別的差異會改變 hash（1 vs "1"）', () => {
    const a = { ...entry, at: 1 };
    const b = { ...entry, at: '1' };
    assert.notEqual(canonicalJSON(a), canonicalJSON(b));
  });
});
