'use strict';

/**
 * ReconciliationService 與 ReconciliationThresholds 測試。
 *
 * 重點：三層閾值的邊界，以及「凍結結算是真的拒絕」這件事
 * 必須在**邏輯層**就成立（不能只是一個告警旗標）。
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const { ReconciliationThresholds, DEFAULTS } = require('../../../../packages/domain/reconciliation/ReconciliationThresholds');
const {
  compare, shouldFreezeSettlement, DiffType, ReconciliationTier,
} = require('../../../../packages/domain/reconciliation/ReconciliationService');

const rec = (reference, amountCents) => ({ reference, amountCents });

test('ReconciliationThresholds：預設值與不變式', async (t) => {
  await t.test('預設 1 元 / 100 元 / 1000 元', () => {
    const th = ReconciliationThresholds.defaults();
    assert.equal(th.singleCents, 100);
    assert.equal(th.dailyCents, 10000);
    assert.equal(th.freezeCents, 100000);
    assert.deepEqual(DEFAULTS, { singleCents: 100, dailyCents: 10000, freezeCents: 100000 });
  });

  await t.test('⚠️ 閾值必須遞增（否則層級判斷會錯亂）', () => {
    assert.throws(() => new ReconciliationThresholds({ singleCents: 200, dailyCents: 100 }), Error);
    assert.throws(() => new ReconciliationThresholds({ dailyCents: 200000, freezeCents: 100 }), Error);
  });

  await t.test('可全部調降為 0（嚴格對帳）', () => {
    const th = new ReconciliationThresholds({ singleCents: 0, dailyCents: 0, freezeCents: 0 });
    assert.equal(th.tierForSingle(1), 1);
    assert.equal(th.tierForDaily(1), 3);
  });

  await t.test('負數被擋', () => {
    assert.throws(() => new ReconciliationThresholds({ singleCents: -1 }), Error);
  });
});

test('三層閾值的邊界', async (t) => {
  const th = ReconciliationThresholds.defaults();

  await t.test('第 1 層：單筆 > 1 元', () => {
    assert.equal(th.tierForSingle(100), 0, '剛好 1 元不算超過');
    assert.equal(th.tierForSingle(101), 1);
    assert.equal(th.tierForSingle(-101), 1, '負向差異同樣算');
  });

  await t.test('第 2 層：單日 > 100 元', () => {
    assert.equal(th.tierForDaily(10000), 0);
    assert.equal(th.tierForDaily(10001), 2);
  });

  await t.test('第 3 層：單日 > 1000 元', () => {
    assert.equal(th.tierForDaily(100000), 2);
    assert.equal(th.tierForDaily(100001), 3);
  });
});

test('compare：差異偵測', async (t) => {
  await t.test('完全一致 → 乾淨', () => {
    const r = compare({
      systemRecords: [rec('a', 100), rec('b', 200)],
      billRecords: [rec('a', 100), rec('b', 200)],
    });
    assert.equal(r.isClean, true);
    assert.deepEqual(r.diffs, []);
    assert.equal(r.tier, ReconciliationTier.OK);
  });

  await t.test('系統有、帳單沒有 → MISSING_IN_BILL', () => {
    const r = compare({ systemRecords: [rec('a', 100)], billRecords: [] });
    assert.equal(r.diffs[0].type, DiffType.MISSING_IN_BILL);
    assert.equal(r.diffs[0].billCents, null);
  });

  await t.test('帳單有、系統沒有 → MISSING_IN_SYSTEM', () => {
    const r = compare({ systemRecords: [], billRecords: [rec('a', 100)] });
    assert.equal(r.diffs[0].type, DiffType.MISSING_IN_SYSTEM);
    assert.equal(r.diffs[0].systemCents, null);
  });

  await t.test('金額不同 → AMOUNT_MISMATCH', () => {
    const r = compare({ systemRecords: [rec('a', 300)], billRecords: [rec('a', 100)] });
    assert.equal(r.diffs[0].type, DiffType.AMOUNT_MISMATCH);
    assert.equal(r.diffs[0].diffCents, 200);
  });

  await t.test('差異依 reference 排序（結果穩定，可重現）', () => {
    const r = compare({
      systemRecords: [rec('c', 1), rec('a', 1), rec('b', 1)],
      billRecords: [],
    });
    assert.deepEqual(r.diffs.map((d) => d.reference), ['a', 'b', 'c']);
  });
});

test('⚠️ 三層升級與凍結', async (t) => {
  await t.test('小額差異 → ALERT（只告警）', () => {
    const r = compare({ systemRecords: [rec('a', 300)], billRecords: [rec('a', 100)] });
    assert.equal(r.tier, ReconciliationTier.ALERT);
    assert.equal(r.shouldFreezeSettlement, false);
    assert.equal(r.shouldNotifyAdmin, false);
  });

  await t.test('單日累計超 100 元 → NOTIFY_ADMIN', () => {
    const r = compare({ systemRecords: [rec('a', 20100)], billRecords: [rec('a', 100)] });
    assert.equal(r.tier, ReconciliationTier.NOTIFY_ADMIN);
    assert.equal(r.shouldNotifyAdmin, true);
    assert.equal(r.shouldFreezeSettlement, false);
  });

  await t.test('⚠️ 單日累計超 1000 元 → FREEZE_SETTLEMENT（真的凍結）', () => {
    const r = compare({ systemRecords: [rec('a', 200100)], billRecords: [rec('a', 100)] });
    assert.equal(r.tier, ReconciliationTier.FREEZE_SETTLEMENT);
    assert.equal(r.shouldFreezeSettlement, true);
    assert.equal(shouldFreezeSettlement(r), true, 'Q14：凍結必須真的拒絕 ExecuteProfitSharing');
  });

  await t.test('多筆小差異累積也會觸發（不是只看單筆）', () => {
    const many = [];
    const bill = [];
    for (let i = 0; i < 20; i++) {
      many.push(rec(`r${String(i).padStart(2, '0')}`, 1100)); // 每筆差 10 元
      bill.push(rec(`r${String(i).padStart(2, '0')}`, 100));
    }
    const r = compare({ systemRecords: many, billRecords: bill });
    assert.equal(r.tier, ReconciliationTier.NOTIFY_ADMIN, '20 × 10 元 = 200 元（超過 100 未達 1000）');
  });

  await t.test('累積到凍結層級', () => {
    const many = [];
    const bill = [];
    for (let i = 0; i < 20; i++) {
      many.push(rec(`r${String(i).padStart(2, '0')}`, 100000));
      bill.push(rec(`r${String(i).padStart(2, '0')}`, 100));
    }
    const r = compare({ systemRecords: many, billRecords: bill });
    assert.equal(r.shouldFreezeSettlement, true);
  });

  await t.test('負向差異同樣計入累計（少收也是差異）', () => {
    const r = compare({ systemRecords: [rec('a', 100)], billRecords: [rec('a', 200100)] });
    assert.equal(r.shouldFreezeSettlement, true);
  });

  await t.test('閾值可由呼叫方覆寫', () => {
    const r = compare({
      systemRecords: [rec('a', 300)], billRecords: [rec('a', 100)],
      thresholds: { singleCents: 10000, dailyCents: 10000, freezeCents: 10000 },
    });
    assert.equal(r.tier, ReconciliationTier.OK, '提高閾值後 2 元差異不算異常');
  });
});

test('回報的統計值', async (t) => {
  await t.test('totalDiffCents 是絕對值總和', () => {
    const r = compare({
      systemRecords: [rec('a', 300), rec('b', 0)],
      billRecords: [rec('a', 100), rec('b', 50)],
    });
    assert.equal(r.totalDiffCents, 200 + 50);
  });

  await t.test('maxSingleDiffCents', () => {
    const r = compare({
      systemRecords: [rec('a', 300), rec('b', 10000)],
      billRecords: [rec('a', 100), rec('b', 100)],
    });
    assert.equal(r.maxSingleDiffCents, 9900);
  });

  await t.test('diffs 帶出兩邊的金額與差額（供稽核）', () => {
    const r = compare({ systemRecords: [rec('a', 300)], billRecords: [rec('a', 100)] });
    assert.equal(r.diffs[0].systemCents, 300);
    assert.equal(r.diffs[0].billCents, 100);
    assert.equal(r.diffs[0].diffCents, 200);
  });
});

test('錯誤處理', async (t) => {
  await t.test('非陣列 → 拋錯', () => {
    assert.throws(() => compare({ systemRecords: null, billRecords: [] }), Error);
    assert.throws(() => compare({ systemRecords: [], billRecords: 'x' }), Error);
  });

  await t.test('⚠️ 缺 reference → 拋錯（否則會靜默漏比對）', () => {
    assert.throws(() => compare({ systemRecords: [{ amountCents: 1 }], billRecords: [] }), Error);
  });

  await t.test('⚠️ amountCents 非整數 → 拋錯', () => {
    assert.throws(() => compare({ systemRecords: [rec('a', 1.5)], billRecords: [] }), Error);
  });

  await t.test('⚠️ 同一邊 reference 重複 → 拋錯（資料異常不得靜默覆蓋）', () => {
    assert.throws(() => compare({ systemRecords: [rec('a', 1), rec('a', 2)], billRecords: [] }), Error);
  });

  await t.test('空兩邊 → 乾淨', () => {
    const r = compare({ systemRecords: [], billRecords: [] });
    assert.equal(r.isClean, true);
    assert.equal(r.tier, ReconciliationTier.OK);
  });
});

test('⚠️ 純函式：帳單來源不在這裡（P6 才接微信帳單）', async (t) => {
  await t.test('compare 的簽章不含任何 Port 或非同步', () => {
    const r = compare({ systemRecords: [], billRecords: [] });
    assert.equal(typeof r.then, 'undefined', '不是 Promise —— 資料由呼叫方取得');
  });

  await t.test('shouldFreezeSettlement 接受 null 不爆', () => {
    assert.equal(shouldFreezeSettlement(null), false);
  });
});
