'use strict';

/**
 * ContactMaskingPolicy 與 ContactChannelPolicy 測試。
 *
 * 兩者合起來確保：**師傅永遠拿不到客戶的真實號碼**，
 * 且在被擋住時有明確的替代路徑（通道），不會逼出繞道行為。
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const { maskFor, maskAlways, DisclosureLevel } = require('../../../../../packages/domain/order/policies/ContactMaskingPolicy');
const { resolveChannel, ContactChannel, ChannelDecision } = require('../../../../../packages/domain/order/policies/ContactChannelPolicy');
const { MaskedPhone } = require('../../../../../packages/domain/shared/MaskedPhone');
const { makeOrder } = require('../../../../helpers/order');

const CUSTOMER = { userId: 'cust-1', phone: '13812345678' };
const TECH = { id: 'u-tech', role: 'technician', technicianId: 'tech-1' };

test('⚠️ 師傅：一律遮罩，無例外', async (t) => {
  await t.test('回傳 MASKED 與 MaskedPhone', () => {
    const r = maskFor({ viewer: TECH, customer: CUSTOMER });
    assert.equal(r.level, DisclosureLevel.MASKED);
    assert.ok(r.phone instanceof MaskedPhone);
  });

  await t.test('⚠️ 序列化後不含完整號碼', () => {
    const r = maskFor({ viewer: TECH, customer: CUSTOMER });
    const json = JSON.stringify(r);
    assert.equal(json.includes('13812345678'), false);
    assert.match(json, /\*{4}/);
  });

  await t.test('沒有任何角色以外的解鎖條件（不像地址有時間例外）', () => {
    // 簽章裡沒有 now、沒有 order —— 在型別上就表達了「師傅沒有解鎖時機」
    for (const extra of [{ now: Date.now() }, { order: makeOrder() }, { status: 'IN_SERVICE' }]) {
      const r = maskFor({ viewer: TECH, customer: CUSTOMER, ...extra });
      assert.equal(r.level, DisclosureLevel.MASKED, '額外參數不得影響結果');
    }
  });

  await t.test('未知角色 → 遮罩', () => {
    assert.equal(maskFor({ viewer: { id: 'x', role: 'ghost' }, customer: CUSTOMER }).level, DisclosureLevel.MASKED);
  });

  await t.test('沒有 viewer → 遮罩（fail-safe）', () => {
    assert.equal(maskFor({ viewer: null, customer: CUSTOMER }).level, DisclosureLevel.MASKED);
  });
});

test('客服／管理員／本人 → 完整', async (t) => {
  await t.test('客服', () => {
    const r = maskFor({ viewer: { id: 'cs', role: 'cs_agent' }, customer: CUSTOMER });
    assert.equal(r.level, DisclosureLevel.FULL);
    assert.equal(r.phone, '13812345678');
  });

  await t.test('管理員', () => {
    assert.equal(maskFor({ viewer: { id: 'a', role: 'admin' }, customer: CUSTOMER }).level, DisclosureLevel.FULL);
  });

  await t.test('客戶本人', () => {
    assert.equal(maskFor({ viewer: { id: 'cust-1', role: 'customer' }, customer: CUSTOMER }).level, DisclosureLevel.FULL);
  });

  await t.test('其他客戶 → 遮罩', () => {
    assert.equal(maskFor({ viewer: { id: 'cust-2', role: 'customer' }, customer: CUSTOMER }).level, DisclosureLevel.MASKED);
  });
});

test('maskAlways 供師傅端 DTO 組裝', async (t) => {
  await t.test('一律回 MaskedPhone', () => {
    assert.ok(maskAlways('13812345678') instanceof MaskedPhone);
  });
});

test('缺資料的處理', async (t) => {
  await t.test('沒有 customer 或 phone → MASKED 且 phone 為 null', () => {
    assert.deepEqual(maskFor({ viewer: TECH, customer: null }), { level: DisclosureLevel.MASKED, phone: null });
    assert.deepEqual(maskFor({ viewer: TECH, customer: {} }), { level: DisclosureLevel.MASKED, phone: null });
  });
});

test('⚠️ 聯繫通道降級鏈', async (t) => {
  const order = makeOrder({ to: ['paid', 'assigned', 'accepted'] });

  await t.test('AXB 可用 → 首選虛擬號', () => {
    const r = resolveChannel({ viewer: TECH, order, channelCapabilities: { axbAvailable: true, csOnline: true } });
    assert.equal(r.decision, ChannelDecision.USE_AXB);
    assert.equal(r.channel, ContactChannel.AXB_VIRTUAL_NUMBER);
  });

  await t.test('AXB 不可用但客服在線 → 三方通話', () => {
    const r = resolveChannel({ viewer: TECH, order, channelCapabilities: { axbAvailable: false, csOnline: true } });
    assert.equal(r.decision, ChannelDecision.USE_CS_THREE_WAY);
    assert.equal(r.channel, ContactChannel.CS_THREE_WAY_CALL);
  });

  await t.test('⚠️ 都不可用 → 拒絕，**不退化為提供客戶號碼**', () => {
    const r = resolveChannel({ viewer: TECH, order, channelCapabilities: {} });
    assert.equal(r.decision, ChannelDecision.DENIED_NO_CHANNEL);
    assert.equal(r.channel, null);
    assert.ok(r.reason, '必須給出明確原因，否則師傅會自己想辦法');
    assert.match(r.reason, /稍後再試|客服工單/);
  });

  await t.test('沒有 channelCapabilities → 拒絕（fail-closed）', () => {
    assert.equal(resolveChannel({ viewer: TECH, order }).decision, ChannelDecision.DENIED_NO_CHANNEL);
  });
});

test('通道：只有被指派的師傅能發起', async (t) => {
  const order = makeOrder({ to: ['paid', 'assigned', 'accepted'] });
  const caps = { axbAvailable: true, csOnline: true };

  await t.test('被指派者', () => {
    assert.equal(resolveChannel({ viewer: TECH, order, channelCapabilities: caps }).decision, ChannelDecision.USE_AXB);
  });

  await t.test('非指派師傅 → 拒絕', () => {
    const other = { id: 'u2', role: 'technician', technicianId: 'tech-other' };
    assert.equal(resolveChannel({ viewer: other, order, channelCapabilities: caps }).decision, ChannelDecision.DENIED_NOT_ASSIGNED);
  });

  await t.test('客服／客戶不能走這條通道（他們本來就看得到號碼）', () => {
    assert.equal(resolveChannel({ viewer: { id: 'cs', role: 'cs_agent' }, order, channelCapabilities: caps }).decision, ChannelDecision.DENIED_NOT_ASSIGNED);
    assert.equal(resolveChannel({ viewer: { id: 'c1', role: 'customer' }, order, channelCapabilities: caps }).decision, ChannelDecision.DENIED_NOT_ASSIGNED);
  });

  await t.test('⚠️ 通道決策不含任何號碼（號碼由 adapter 提供）', () => {
    const r = resolveChannel({ viewer: TECH, order, channelCapabilities: caps });
    assert.deepEqual(Object.keys(r).sort(), ['channel', 'decision', 'reason']);
    assert.equal(JSON.stringify(r).includes('138'), false);
  });
});
