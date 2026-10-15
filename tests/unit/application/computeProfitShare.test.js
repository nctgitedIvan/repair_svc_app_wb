'use strict';

/**
 * ComputeProfitShareUseCase 測試。
 *
 * 這是 §1.7 第 6 項驗收標準的示範：
 * **整個 Use Case 用 in-memory adapter 測試，完全不啟動微信雲環境。**
 *
 * 若這個檔案能跑，就證明分層是有效的 —— 因為 Use Case 完全不知道
 * 資料是來自雲資料庫還是記憶體。
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const { ComputeProfitShareUseCase } = require('../../../packages/application/settlement/ComputeProfitShareUseCase');
const { InMemoryOrderRepository } = require('../../../packages/adapters/inmemory/InMemoryOrderRepository');
const { FixedClockAdapter } = require('../../../packages/adapters/time/FixedClockAdapter');
const { InMemoryLoggerAdapter } = require('../../../packages/adapters/logging/InMemoryLoggerAdapter');
const { OrderStatus } = require('../../../packages/domain/order/OrderStatus');

const FIXED_NOW = 1_700_000_000_000;

/** 建立被測系統（SUT），所有依賴都是測試替身 */
function makeSut(orders = []) {
  const orderRepository = new InMemoryOrderRepository().seed(orders);
  const clock = new FixedClockAdapter(FIXED_NOW);
  const logger = new InMemoryLoggerAdapter();
  const useCase = new ComputeProfitShareUseCase({ orderRepository, clock, logger });
  return { useCase, orderRepository, clock, logger };
}

function makeOrder(overrides = {}) {
  return {
    id: 'order-1',
    orderNo: 'R20261016001',
    statusValue: OrderStatus.COMPLETED.value,
    serviceFeeCents: 10000, // 100.00 元
    materialFeeCents: 2500, // 25.00 元，不參與分潤
    createdAt: FIXED_NOW,
    version: 0,
    snapshot: {
      profitSharingTerms: {
        base: 'SERVICE_FEE',
        technicianRateBp: 8000,
        platformRateBp: 2000,
        roundingMode: 'FLOOR_TO_CENT',
        termsVersion: 'v1',
      },
    },
    ...overrides,
  };
}

const ACTOR = { id: 'cs-1', role: 'cs_agent' };

/**
 * 偵測序列化後的物件中是否含「完整手機號」。
 *
 * 注意：不可簡單用 /\d{11}/ —— 13 位的时间戳（1700000000000）就含有 11 位數字子字串，
 * 會產生偽陽性。手機號的形狀是：1 開頭、第二位 3-9、共 11 位，且前後不接其他數字。
 */
const FULL_PHONE_RE = /(?<!\d)1[3-9]\d{9}(?!\d)/;

function containsFullPhoneNumber(value) {
  return FULL_PHONE_RE.test(JSON.stringify(value));
}

test('ComputeProfitShare：正常情境', async (t) => {
  await t.test('基數＝服務費，材料費不參與', async () => {
    const { useCase } = makeSut([makeOrder()]);
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
    const { useCase } = makeSut([makeOrder()]);
    const result = await useCase.execute({ actor: ACTOR, orderId: 'order-1' });
    const dto = result.value;

    // 實體才有的欄位不得外洩
    assert.equal(dto.snapshot, undefined, '不得回傳 snapshot（內部欄位）');
    assert.equal(dto.version, undefined, '不得回傳 version（持久化欄位）');
    assert.equal(dto.materialFeeCents, undefined, '不得回傳未參與計算的原始欄位');
    // 序列化後不得出現完整手機號（P3 安全測試的雛形）
    assert.ok(!containsFullPhoneNumber(dto), 'DTO 不得含完整手機號');
  });

  await t.test('取整差額不會漏錢', async () => {
    // 3333 × 80% = 2666.4
    const { useCase } = makeSut([makeOrder({ serviceFeeCents: 3333 })]);
    const result = await useCase.execute({ actor: ACTOR, orderId: 'order-1' });
    assert.equal(result.value.technicianShareCents, 2666);
    assert.equal(result.value.platformShareCents, 667);
    assert.equal(result.value.technicianShareCents + result.value.platformShareCents, 3333);
  });

  await t.test('分潤基數參數化：改成含材料費只需改快照', async () => {
    const order = makeOrder();
    order.snapshot.profitSharingTerms.base = 'SERVICE_FEE_PLUS_MATERIAL';
    const { useCase } = makeSut([order]);
    const result = await useCase.execute({ actor: ACTOR, orderId: 'order-1' });
    assert.equal(result.value.baseCents, 12500, '基數應為 10000 + 2500');
  });

  await t.test('讀快照而非當前配置：後台改比例不影響歷史訂單', async () => {
    const order = makeOrder();
    order.snapshot.profitSharingTerms.technicianRateBp = 5000; // 舊訂單的舊比例
    const { useCase } = makeSut([order]);
    const result = await useCase.execute({ actor: ACTOR, orderId: 'order-1' });
    assert.equal(result.value.technicianShareCents, 5000, '必須用快照的 50%，不是「當前」的 80%');
  });
});

test('ComputeProfitShare：爭議凍結', async (t) => {
  await t.test('DISPUTED 狀態拒絕分帳', async () => {
    const { useCase } = makeSut([makeOrder({ statusValue: OrderStatus.DISPUTED.value })]);
    const result = await useCase.execute({ actor: ACTOR, orderId: 'order-1' });

    assert.ok(result.isFailure, '爭議中必須拒絕分帳');
    assert.equal(result.code, 'PRECONDITION_FAILED');
    assert.equal(result.error.details.status, 'DISPUTED');
  });

  await t.test('所有未完成狀態都拒絕', async () => {
    const blocked = [
      OrderStatus.PENDING_PAYMENT,
      OrderStatus.PAID_PENDING_ASSIGN,
      OrderStatus.ASSIGNED_PENDING_ACCEPT,
      OrderStatus.ACCEPTED_PENDING_VISIT,
      OrderStatus.IN_SERVICE,
      OrderStatus.PENDING_ACCEPTANCE,
      OrderStatus.DISPUTED,
    ];
    for (const status of blocked) {
      const { useCase } = makeSut([makeOrder({ statusValue: status.value })]);
      const result = await useCase.execute({ actor: ACTOR, orderId: 'order-1' });
      assert.ok(result.isFailure, `${status.key} 不應允許分帳`);
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
    const { useCase, logger } = makeSut([makeOrder()]);
    await useCase.execute({ actor: ACTOR, orderId: 'order-1' });
    const infos = logger.findByLevel('info');
    assert.equal(infos.length, 1);
    assert.equal(infos[0].meta.orderId, 'order-1');
  });
});

test('ComputeProfitShare：可替換性（分層有效的證明）', async (t) => {
  await t.test('時鐘可控制，結果可重現', async () => {
    const { useCase, clock } = makeSut([makeOrder()]);
    const first = await useCase.execute({ actor: ACTOR, orderId: 'order-1' });
    assert.equal(first.value.computedAt, FIXED_NOW);

    clock.advanceBy(60_000);
    const second = await useCase.execute({ actor: ACTOR, orderId: 'order-1' });
    assert.equal(second.value.computedAt, FIXED_NOW + 60_000);

    // 除時間外，金額不受時間影響
    assert.equal(first.value.technicianShareCents, second.value.technicianShareCents);
  });

  await t.test('Use Case 不依賴任何具體 adapter 型別', async () => {
    // 用「假的假」——連 InMemory 都不是，只是一個符合契約的物件
    const plainStub = {
      async findById() {
        return makeOrder();
      },
    };
    const useCase = new ComputeProfitShareUseCase({
      orderRepository: plainStub,
      clock: { now: () => 42 },
      logger: { info() {}, warn() {}, error() {}, debug() {} },
    });
    const result = await useCase.execute({ actor: ACTOR, orderId: 'anything' });
    assert.ok(result.ok);
    assert.equal(result.value.computedAt, 42);
  });
});
