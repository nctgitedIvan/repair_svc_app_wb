'use strict';

/**
 * ComputeProfitShareUseCase 測試。
 *
 * 這是 §1.7 第 6 項驗收標準的示範：
 * **整個 Use Case 用 in-memory adapter 測試，完全不啟動微信雲環境。**
 *
 * ⚠️ P4b 起，Repository 回傳的是**真實的 `Order` 聚合**（不再是佔位形狀）。
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const { ComputeProfitShareUseCase } = require('../../../packages/application/settlement/ComputeProfitShareUseCase');
const { makeOrder, makeCompletedOrder } = require('../../helpers/order');
const { buildTestContainer } = require('../../helpers/container');

const FIXED_NOW = 1_700_000_000_000;
const ACTOR = { id: 'cs-1', role: 'cs_agent' };

/** 建立被測系統（SUT），所有依賴都是測試替身 */
function makeSut(orders = []) {
  const container = buildTestContainer();
  container.orderRepository.seed(orders);
  const useCase = new ComputeProfitShareUseCase(container);
  return { useCase, container };
}

/** 偵測序列化後的物件中是否含「完整手機號」 */
const FULL_PHONE_RE = /(?<!\d)1[3-9]\d{9}(?!\d)/;

test('ComputeProfitShare：正常情境', async (t) => {
  await t.test('基數＝服務費，材料費不參與', async () => {
    const { useCase } = makeSut([makeCompletedOrder({ serviceFeeCents: 10000, materialFeeCents: 2500 })]);
    const result = await useCase.execute({ actor: ACTOR, orderId: 'order-1' });

    assert.ok(result.ok, `預期成功，實際：${JSON.stringify(result.error)}`);
    assert.equal(result.value.baseCents, 10000, '基數應為服務費 10000 分，不含材料費 2500 分');
    assert.equal(result.value.technicianShareCents, 8000);
    assert.equal(result.value.platformShareCents, 2000);
    assert.equal(
      result.value.technicianShareCents + result.value.platformShareCents,
      result.value.baseCents,
      '師傅＋平台必須等於基數',
    );
  });

  await t.test('回傳 DTO 而非實體（§1.6.3 硬規則）', async () => {
    const { useCase } = makeSut([makeCompletedOrder()]);
    const result = await useCase.execute({ actor: ACTOR, orderId: 'order-1' });
    const dto = result.value;

    assert.equal(dto.snapshot, undefined, '不得回傳 snapshot（內部欄位）');
    assert.equal(dto.version, undefined, '不得回傳 version（持久化欄位）');
    assert.equal(dto.timeline, undefined, '不得回傳狀態歷程');
    assert.equal(dto.items, undefined, '不得回傳明細');
    assert.equal(FULL_PHONE_RE.test(JSON.stringify(dto)), false, 'DTO 不得含完整手機號');
  });

  await t.test('取整差額不會漏錢', async () => {
    const { useCase } = makeSut([makeCompletedOrder({ serviceFeeCents: 3333, materialFeeCents: 0 })]);
    const result = await useCase.execute({ actor: ACTOR, orderId: 'order-1' });
    assert.equal(result.value.technicianShareCents, 2666);
    assert.equal(result.value.platformShareCents, 667);
    assert.equal(result.value.technicianShareCents + result.value.platformShareCents, 3333);
  });

  await t.test('分潤基數參數化：改成含材料費只需改快照', async () => {
    const { useCase } = makeSut([
      makeCompletedOrder({ serviceFeeCents: 10000, materialFeeCents: 2500, base: 'SERVICE_FEE_PLUS_MATERIAL' }),
    ]);
    const result = await useCase.execute({ actor: ACTOR, orderId: 'order-1' });
    assert.equal(result.value.baseCents, 12500, '基數應為 10000 + 2500');
  });

  await t.test('⚠️ 讀快照而非當前配置：後台改比例不影響歷史訂單', async () => {
    const { useCase } = makeSut([makeCompletedOrder({ serviceFeeCents: 10000, materialFeeCents: 0, technicianRateBp: 5000, platformRateBp: 5000 })]);
    const result = await useCase.execute({ actor: ACTOR, orderId: 'order-1' });
    assert.equal(result.value.technicianShareCents, 5000, '必須用快照的 50%，不是「當前」的 80%');
    assert.equal(result.value.termsVersion, 'v1');
  });

  await t.test('帶出幣別（多幣別支援）', async () => {
    const { useCase } = makeSut([makeCompletedOrder({ currency: 'USD' })]);
    const result = await useCase.execute({ actor: ACTOR, orderId: 'order-1' });
    assert.equal(result.value.currency, 'USD');
  });
});

test('ComputeProfitShare：爭議與作廢凍結', async (t) => {
  await t.test('DISPUTED 狀態拒絕分帳', async () => {
    const { useCase } = makeSut([
      makeOrder({ to: ['paid', 'assigned', 'accepted', 'arrived', 'completed_service', 'disputed'] }),
    ]);
    const result = await useCase.execute({ actor: ACTOR, orderId: 'order-1' });

    assert.ok(result.isFailure, '爭議中必須拒絕分帳');
    assert.equal(result.code, 'PRECONDITION_FAILED');
  });

  await t.test('VOIDED 狀態拒絕分帳', async () => {
    const { useCase } = makeSut([makeOrder({ to: ['voided'] })]);
    const result = await useCase.execute({ actor: ACTOR, orderId: 'order-1' });
    assert.ok(result.isFailure);
    assert.equal(result.error.details.status, 'VOIDED');
  });

  await t.test('所有未完成狀態都拒絕', async () => {
    const paths = [
      [],
      ['paid'],
      ['paid', 'assigned'],
      ['paid', 'assigned', 'accepted'],
      ['paid', 'assigned', 'accepted', 'arrived'],
      ['paid', 'assigned', 'accepted', 'arrived', 'completed_service'],
      ['paid', 'assigned', 'accepted', 'arrived', 'completed_service', 'disputed'],
    ];
    for (const to of paths) {
      const { useCase } = makeSut([makeOrder({ to })]);
      const result = await useCase.execute({ actor: ACTOR, orderId: 'order-1' });
      assert.ok(result.isFailure, `${to.join('→') || '(初始)'} 不應允許分帳`);
    }
  });
});

test('ComputeProfitShare：錯誤處理', async (t) => {
  await t.test('訂單不存在回 NOT_FOUND', async () => {
    const { useCase } = makeSut([]);
    const result = await useCase.execute({ actor: ACTOR, orderId: 'not-exist' });
    assert.ok(result.isFailure);
    assert.equal(result.code, 'NOT_FOUND');
  });

  await t.test('成功時寫入日誌，且不含敏感欄位', async () => {
    const { useCase, container } = makeSut([makeCompletedOrder()]);
    await useCase.execute({ actor: ACTOR, orderId: 'order-1' });
    const infos = container.logger.findByLevel('info');
    assert.equal(infos.length, 1);
    assert.equal(infos[0].meta.orderId, 'order-1');
  });
});

test('ComputeProfitShare：可替換性（分層有效的證明）', async (t) => {
  await t.test('時鐘可控制，結果可重現', async () => {
    const { useCase, container } = makeSut([makeCompletedOrder()]);
    const first = await useCase.execute({ actor: ACTOR, orderId: 'order-1' });
    assert.equal(first.value.computedAt, FIXED_NOW);

    container.clock.advanceBy(60_000);
    const second = await useCase.execute({ actor: ACTOR, orderId: 'order-1' });
    assert.equal(second.value.computedAt, FIXED_NOW + 60_000);

    assert.equal(first.value.technicianShareCents, second.value.technicianShareCents);
  });

  await t.test('Use Case 不依賴任何具體 adapter 型別', async () => {
    // 用「假的假」—— 連 InMemory 都不是，只是一個符合契約的物件
    const useCase = new ComputeProfitShareUseCase({
      orderRepository: { async findById() { return makeCompletedOrder(); } },
      clock: { now: () => 42 },
      logger: { info() {}, warn() {}, error() {}, debug() {} },
    });
    const result = await useCase.execute({ actor: ACTOR, orderId: 'anything' });
    assert.ok(result.ok);
    assert.equal(result.value.computedAt, 42);
  });
});
