'use strict';

/**
 * InMemorySettlementAdapter 測試。
 *
 * 這是「P1–P5 零外部依賴」的證明：沒有商戶號、沒有分帳權限，
 * 依然能完整測試分帳與退款的邏輯。P6 換上真實 adapter 時，
 * 這個測試的存在讓我們知道「介面是可實作的、可替換的」。
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const { InMemorySettlementAdapter } = require('../../../packages/adapters');
const { SettlementMode, SettlementStatus } = require('../../../packages/ports');

const ORDER = { id: 'o1', statusValue: 70 };

test('capabilities：兩種結算模式', async (t) => {
  await t.test('主方案（分帳）：需要凍結、需要回退、需要師傅進件', () => {
    const caps = new InMemorySettlementAdapter({ settlementMode: SettlementMode.PROFIT_SHARING }).capabilities();
    assert.equal(caps.settlementMode, 'PROFIT_SHARING');
    assert.equal(caps.supportsFreeze, true);
    assert.equal(caps.supportsSharingReturn, true);
    assert.equal(caps.requiresReceiverOnboarding, true);
    assert.equal(caps.supportsPartialRefund, true);
  });

  await t.test('備案（平台代收）：不需凍結、不需回退、不需進件', () => {
    const caps = new InMemorySettlementAdapter({ settlementMode: SettlementMode.PLATFORM_ESCROW }).capabilities();
    assert.equal(caps.settlementMode, 'PLATFORM_ESCROW');
    assert.equal(caps.supportsFreeze, false);
    assert.equal(caps.supportsSharingReturn, false, '備案不需要分帳回退 —— Use Case 據此跳過該步驟');
    assert.equal(caps.requiresReceiverOnboarding, false);
  });

  await t.test('可覆寫能力宣告（測試用）', () => {
    const caps = new InMemorySettlementAdapter({ capabilities: { settlementMode: 'X', supportsFreeze: false } }).capabilities();
    assert.equal(caps.settlementMode, 'X');
  });
});

test('四種結果皆可模擬', async (t) => {
  await t.test('SUCCESS', async () => {
    const r = await new InMemorySettlementAdapter().settle(ORDER);
    assert.equal(r.status, SettlementStatus.SUCCESS);
    assert.ok(r.reference);
  });

  await t.test('FAILED', async () => {
    const r = await new InMemorySettlementAdapter({ outcomes: { settle: 'FAILED' } }).settle(ORDER);
    assert.equal(r.status, SettlementStatus.FAILED);
    assert.equal(r.reference, null);
  });

  await t.test('PENDING → 可用 querySettlement 收斂', async () => {
    const s = new InMemorySettlementAdapter({ outcomes: { settle: 'PENDING' } });
    const r = await s.settle(ORDER);
    assert.equal(r.status, SettlementStatus.PENDING);

    assert.equal((await s.querySettlement(r.reference)).status, SettlementStatus.PENDING);
    s.completePending(r.reference);
    assert.equal((await s.querySettlement(r.reference)).status, SettlementStatus.SUCCESS);
  });

  await t.test('PENDING 也可收斂成 FAILED', async () => {
    const s = new InMemorySettlementAdapter({ outcomes: { settle: 'PENDING' } });
    const r = await s.settle(ORDER);
    s.completePending(r.reference, SettlementStatus.FAILED);
    assert.equal((await s.querySettlement(r.reference)).status, SettlementStatus.FAILED);
  });

  await t.test('⚠️ TIMEOUT 拋出且標記 retryable（逾時不是業務失敗）', async () => {
    const s = new InMemorySettlementAdapter({ outcomes: { settle: 'TIMEOUT' } });
    await assert.rejects(() => s.settle(ORDER), (err) => {
      assert.equal(err.code, 'TIMEOUT');
      assert.equal(err.retryable, true, '逾時必須可重試，否則補償流程無從判斷');
      return true;
    });
  });

  await t.test('查詢不存在的 reference 回 FAILED 而非拋錯', async () => {
    const r = await new InMemorySettlementAdapter().querySettlement('nope');
    assert.equal(r.status, SettlementStatus.FAILED);
  });

  await t.test('setOutcome 可中途改變行為（模擬部分失敗）', async () => {
    const s = new InMemorySettlementAdapter();
    assert.equal((await s.settle(ORDER)).status, SettlementStatus.SUCCESS);
    s.setOutcome('settle', 'FAILED');
    assert.equal((await s.settle(ORDER)).status, SettlementStatus.FAILED);
  });
});

test('呼叫順序可被斷言（P5 驗證「退款前先分帳回退」的基礎）', async (t) => {
  await t.test('methodNames 依呼叫順序回傳', async () => {
    const s = new InMemorySettlementAdapter();
    await s.onPaymentSuccess(ORDER, { transactionId: 't1' });
    await s.settle(ORDER);
    await s.beforeRefund(ORDER, 5000);
    await s.refund(ORDER, { outRefundNo: 'r1', amountCents: 5000, reason: '客戶取消' });

    assert.deepEqual(s.methodNames(), ['onPaymentSuccess', 'settle', 'beforeRefund', 'refund']);
  });

  await t.test('⚠️ 正確順序：settle 在 beforeRefund 之前', async () => {
    const s = new InMemorySettlementAdapter();
    await s.settle(ORDER);
    await s.beforeRefund(ORDER, 5000);

    const names = s.methodNames();
    assert.ok(
      names.indexOf('settle') < names.indexOf('beforeRefund'),
      '分帳必須在退款前完成，否則沒有東西可回退',
    );
  });

  await t.test('calls() 帶出參數，可斷言回退金額', async () => {
    const s = new InMemorySettlementAdapter();
    await s.beforeRefund(ORDER, 12345);
    const call = s.calls().find((c) => c.method === 'beforeRefund');
    assert.equal(call.refundAmountCents, 12345);
    assert.equal(call.orderId, 'o1');
  });

  await t.test('reset 清空記錄與待處理項', async () => {
    const s = new InMemorySettlementAdapter({ outcomes: { settle: 'PENDING' } });
    const r = await s.settle(ORDER);
    s.reset();
    assert.deepEqual(s.methodNames(), []);
    assert.equal((await s.querySettlement(r.reference)).status, SettlementStatus.FAILED);
  });
});

test('beforeRefund：回退金額', async (t) => {
  await t.test('成功時回報回退金額', async () => {
    const r = await new InMemorySettlementAdapter().beforeRefund(ORDER, 5000);
    assert.equal(r.status, SettlementStatus.SUCCESS);
    assert.equal(r.returnedCents, 5000);
  });

  await t.test('失敗時不回報回退金額（呼叫端據此阻止退款）', async () => {
    const s = new InMemorySettlementAdapter({ outcomes: { beforeRefund: 'FAILED' } });
    const r = await s.beforeRefund(ORDER, 5000);
    assert.equal(r.status, SettlementStatus.FAILED);
    assert.equal(r.returnedCents, undefined);
  });
});

test('⚠️ 可替換性：同一段呼叫在兩種模式下都成立', async (t) => {
  await t.test('呼叫端依 capabilities() 決定是否執行 beforeRefund', async () => {
    async function runRefundFlow(gateway) {
      const caps = gateway.capabilities();
      const steps = ['refund'];
      if (caps.supportsSharingReturn) {
        await gateway.beforeRefund(ORDER, 5000);
        steps.unshift('beforeRefund');
      }
      await gateway.refund(ORDER, { outRefundNo: 'r1', amountCents: 5000, reason: 'x' });
      return steps;
    }

    const sharing = await runRefundFlow(new InMemorySettlementAdapter({ settlementMode: SettlementMode.PROFIT_SHARING }));
    assert.deepEqual(sharing, ['beforeRefund', 'refund'], '分帳模式必須先回退');

    const escrow = await runRefundFlow(new InMemorySettlementAdapter({ settlementMode: SettlementMode.PLATFORM_ESCROW }));
    assert.deepEqual(escrow, ['refund'], '備案模式直接退款');
  });
});
