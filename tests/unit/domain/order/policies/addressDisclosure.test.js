'use strict';

/**
 * AddressDisclosurePolicy 測試。
 *
 * 重點在**邊界時間**：08:00 的前一秒與後一秒、7 天降級的前後。
 * 這類規則寫錯不會當場炸，只會在某天的某個時刻悄悄洩漏門牌。
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const { discloseFor, disclosureStartAt, DEFAULT_CONFIG } = require('../../../../../packages/domain/order/policies/AddressDisclosurePolicy');
const { DisclosureLevel } = require('../../../../../packages/domain/shared/AddressView');
const { makeOrder } = require('../../../../helpers/order');

const HOUR = 3_600_000;
const DAY = 86_400_000;
/** 當地 2026-10-20 14:00（UTC+8） */
const APPT = Date.parse('2026-10-20T06:00:00Z');
const CREATED = APPT - 2 * DAY;

const TECH = { id: 'u-tech', role: 'technician', technicianId: 'tech-1' };
const OTHER_TECH = { id: 'u-other', role: 'technician', technicianId: 'tech-other' };
const CS = { id: 'cs-1', role: 'cs_agent' };
const ADMIN = { id: 'a-1', role: 'admin' };
const CUSTOMER = { id: 'cust-1', role: 'customer' };

function acceptedOrder() {
  return makeOrder({ to: ['paid', 'assigned', 'accepted'], appointmentAt: APPT, createdAt: CREATED });
}

test('揭露起始時刻的計算', async (t) => {
  await t.test('預約當地 14:00 → 當日 08:00 揭露', () => {
    assert.equal(new Date(disclosureStartAt(APPT)).toISOString(), '2026-10-20T00:00:00.000Z');
  });

  await t.test('預約當地 06:00（早於揭露時刻）→ 仍是當日 08:00', () => {
    const early = Date.parse('2026-10-19T22:00:00Z'); // 當地 10-20 06:00
    assert.equal(new Date(disclosureStartAt(early)).toISOString(), '2026-10-20T00:00:00.000Z');
  });

  await t.test('可設定不同的揭露時刻與時區', () => {
    const cfg = { discloseHour: 6, utcOffsetMinutes: 0 };
    assert.equal(new Date(disclosureStartAt(APPT, cfg)).toISOString(), '2026-10-20T06:00:00.000Z');
  });
});

test('客服／管理員 → 永遠完整', async (t) => {
  const order = acceptedOrder();
  for (const viewer of [CS, ADMIN]) {
    await t.test(`${viewer.role} 在服務前一週也是 FULL`, () => {
      const v = discloseFor({ viewer, order, now: APPT - 7 * DAY });
      assert.equal(v.level, DisclosureLevel.FULL);
      assert.ok(v.detailAddress);
    });
  }
});

test('客戶本人 → 完整；他人 → 不給', async (t) => {
  const order = acceptedOrder();

  await t.test('本人完整', () => {
    assert.equal(discloseFor({ viewer: CUSTOMER, order, now: APPT - 7 * DAY }).level, DisclosureLevel.FULL);
  });

  await t.test('其他客戶只能拿區域級', () => {
    const v = discloseFor({ viewer: { id: 'cust-999', role: 'customer' }, order, now: APPT + HOUR });
    assert.equal(v.level, DisclosureLevel.DISTRICT);
    assert.equal(v.detailAddress, null);
  });
});

test('⚠️ 師傅：時間軸與邊界', async (t) => {
  const order = acceptedOrder();

  await t.test('服務前兩天 → DISTRICT 且門牌為 null', () => {
    const v = discloseFor({ viewer: TECH, order, now: APPT - 2 * DAY });
    assert.equal(v.level, DisclosureLevel.DISTRICT);
    assert.equal(v.detailAddress, null, '門牌必須是 null，不是空字串或 undefined');
  });

  await t.test('服務前一天 → DISTRICT', () => {
    assert.equal(discloseFor({ viewer: TECH, order, now: APPT - DAY }).level, DisclosureLevel.DISTRICT);
  });

  await t.test('⚠️ 當日 07:59:59 → 仍是 DISTRICT', () => {
    const justBefore = Date.parse('2026-10-19T23:59:59Z'); // 當地 10-20 07:59:59
    const v = discloseFor({ viewer: TECH, order, now: justBefore });
    assert.equal(v.level, DisclosureLevel.DISTRICT);
    assert.equal(v.detailAddress, null);
  });

  await t.test('⚠️ 當日 08:00:00 → FULL', () => {
    const exactly = Date.parse('2026-10-20T00:00:00Z');
    const v = discloseFor({ viewer: TECH, order, now: exactly });
    assert.equal(v.level, DisclosureLevel.FULL);
    assert.equal(v.detailAddress, '中心路28號3棟5B');
  });

  await t.test('服務之後仍是 FULL（直到完工降級）', () => {
    assert.equal(discloseFor({ viewer: TECH, order, now: APPT + 3 * HOUR }).level, DisclosureLevel.FULL);
  });
});

test('⚠️ 非指派師傅：永遠 DISTRICT', async (t) => {
  const order = acceptedOrder();

  await t.test('服務當日 08:00 後仍不給', () => {
    const v = discloseFor({ viewer: OTHER_TECH, order, now: APPT + 10 * HOUR });
    assert.equal(v.level, DisclosureLevel.DISTRICT);
    assert.equal(v.detailAddress, null);
  });

  await t.test('沒有 technicianId 的師傅也不給', () => {
    assert.equal(discloseFor({ viewer: { id: 'x', role: 'technician' }, order, now: APPT + 10 * HOUR }).level, DisclosureLevel.DISTRICT);
  });
});

test('⚠️ 完工後 N 天自動降級', async (t) => {
  const order = makeOrder({
    to: ['paid', 'assigned', 'accepted', 'arrived', 'completed_service', 'completed'],
    appointmentAt: APPT,
    createdAt: CREATED,
  });
  const cd = order.completedAt;

  await t.test('完工後 7 天內 → 仍可完整（若已過服務日 08:00）', () => {
    const v = discloseFor({ viewer: TECH, order, now: cd + 6 * DAY });
    assert.equal(v.level, DisclosureLevel.FULL);
  });

  await t.test('完工後 8 天 → DISTRICT', () => {
    const v = discloseFor({ viewer: TECH, order, now: cd + 8 * DAY });
    assert.equal(v.level, DisclosureLevel.DISTRICT);
    assert.equal(v.detailAddress, null);
  });

  await t.test('降級天數可設定', () => {
    const v = discloseFor({ viewer: TECH, order, now: cd + 2 * DAY, config: { revokeAfterDays: 1 } });
    assert.equal(v.level, DisclosureLevel.DISTRICT);
  });

  await t.test('客戶本人不受降級影響', () => {
    assert.equal(discloseFor({ viewer: CUSTOMER, order, now: cd + 100 * DAY }).level, DisclosureLevel.FULL);
  });
});

test('缺少資料時 fail-safe（寧可少給）', async (t) => {
  await t.test('沒有 address → 回最低層級，不拋錯', () => {
    const v = discloseFor({ viewer: TECH, order: { technicianId: 'tech-1' }, now: APPT });
    assert.equal(v.level, DisclosureLevel.DISTRICT);
    assert.equal(v.detailAddress, null);
  });

  await t.test('沒有 viewer → 最低層級', () => {
    assert.equal(discloseFor({ viewer: null, order: acceptedOrder(), now: APPT }).level, DisclosureLevel.DISTRICT);
  });

  await t.test('沒有 now 或 appointmentAt → 停在 DISTRICT（不誤放行）', () => {
    const order = acceptedOrder();
    assert.equal(discloseFor({ viewer: TECH, order }).level, DisclosureLevel.DISTRICT);
  });
});

test('回傳的是 AddressView，不是 Address', async (t) => {
  await t.test('DISTRICT 級別的物件沒有可用的門牌欄位', () => {
    const v = discloseFor({ viewer: TECH, order: acceptedOrder(), now: APPT - DAY });
    assert.equal(v.detailAddress, null);
    assert.equal(JSON.stringify(v).includes('中心路'), false, '序列化後也不得含門牌');
  });

  await t.test('預設設定值符合文件', () => {
    assert.equal(DEFAULT_CONFIG.discloseHour, 8);
    assert.equal(DEFAULT_CONFIG.revokeAfterDays, 7);
    assert.equal(DEFAULT_CONFIG.utcOffsetMinutes, 480);
  });
});
