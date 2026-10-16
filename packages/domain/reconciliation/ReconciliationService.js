'use strict';

const { invariant, assertArray } = require('../shared/assertions');
const { ReconciliationThresholds } = require('./ReconciliationThresholds');

/**
 * ReconciliationService —— 系統記錄 vs 帳單的差異比對。
 *
 * **純函式**：兩邊的資料都由呼叫方取得後傳入。
 * 「帳單從哪來」是外部依賴（P6 才接微信帳單），但**比對邏輯是領域問題**，
 * 可以在 P4 完整測試 —— 不要讓兩者綁在一起等 A1。
 *
 * 對應 `docs/P2-計畫.md` §B-3、Q10、Q14。
 */

const DiffType = Object.freeze({
  /** 系統有、帳單沒有 */
  MISSING_IN_BILL: 'MISSING_IN_BILL',
  /** 帳單有、系統沒有 */
  MISSING_IN_SYSTEM: 'MISSING_IN_SYSTEM',
  /** 兩邊都有但金額不同 */
  AMOUNT_MISMATCH: 'AMOUNT_MISMATCH',
});

const ReconciliationTier = Object.freeze({
  /** 在容許範圍內 */
  OK: 0,
  /** 單筆超閾值 → 告警 */
  ALERT: 1,
  /** 單日累計超閾值 → 通知管理員 */
  NOTIFY_ADMIN: 2,
  /** 單日累計超凍結閾值 → **凍結當日結算** */
  FREEZE_SETTLEMENT: 3,
});

/**
 * 比對兩邊的紀錄。
 *
 * @param {object} params
 * @param {Array<{ reference: string, amountCents: number }>} params.systemRecords
 * @param {Array<{ reference: string, amountCents: number }>} params.billRecords
 * @param {ReconciliationThresholds} [params.thresholds]
 * @returns {{
 *   diffs: Array<object>,
 *   totalDiffCents: number,
 *   maxSingleDiffCents: number,
 *   tier: number,
 *   shouldFreezeSettlement: boolean,
 *   shouldNotifyAdmin: boolean,
 *   isClean: boolean
 * }}
 */
function compare({ systemRecords, billRecords, thresholds }) {
  assertArray(systemRecords, 'systemRecords');
  assertArray(billRecords, 'billRecords');

  const th = thresholds instanceof ReconciliationThresholds
    ? thresholds
    : new ReconciliationThresholds(thresholds || {});

  const systemMap = indexByReference(systemRecords, 'systemRecords');
  const billMap = indexByReference(billRecords, 'billRecords');

  const diffs = [];

  // 系統有、帳單沒有 → 或金額不符
  for (const [ref, sysAmount] of systemMap) {
    if (!billMap.has(ref)) {
      diffs.push({ reference: ref, type: DiffType.MISSING_IN_BILL, systemCents: sysAmount, billCents: null, diffCents: sysAmount });
      continue;
    }
    const billAmount = billMap.get(ref);
    if (sysAmount !== billAmount) {
      diffs.push({
        reference: ref, type: DiffType.AMOUNT_MISMATCH,
        systemCents: sysAmount, billCents: billAmount, diffCents: sysAmount - billAmount,
      });
    }
  }

  // 帳單有、系統沒有
  for (const [ref, billAmount] of billMap) {
    if (!systemMap.has(ref)) {
      diffs.push({ reference: ref, type: DiffType.MISSING_IN_SYSTEM, systemCents: null, billCents: billAmount, diffCents: -billAmount });
    }
  }

  diffs.sort((a, b) => a.reference.localeCompare(b.reference));

  const totalDiffCents = diffs.reduce((sum, d) => sum + Math.abs(d.diffCents), 0);
  const maxSingleDiffCents = diffs.reduce((max, d) => Math.max(max, Math.abs(d.diffCents)), 0);

  const dailyTier = th.tierForDaily(totalDiffCents);
  const hasSingleOverThreshold = diffs.some((d) => th.tierForSingle(d.diffCents) > 0);

  let tier = ReconciliationTier.OK;
  if (dailyTier === 3) tier = ReconciliationTier.FREEZE_SETTLEMENT;
  else if (dailyTier === 2) tier = ReconciliationTier.NOTIFY_ADMIN;
  else if (hasSingleOverThreshold) tier = ReconciliationTier.ALERT;

  return {
    diffs,
    totalDiffCents,
    maxSingleDiffCents,
    tier,
    shouldFreezeSettlement: tier === ReconciliationTier.FREEZE_SETTLEMENT,
    shouldNotifyAdmin: tier >= ReconciliationTier.NOTIFY_ADMIN,
    isClean: diffs.length === 0,
  };
}

function indexByReference(records, label) {
  const map = new Map();
  for (const r of records) {
    invariant(r && typeof r.reference === 'string' && r.reference.length > 0, `${label} 的每筆紀錄都需要 reference`);
    invariant(Number.isInteger(r.amountCents), `${label}（${r.reference}）的 amountCents 必須是整數分`);
    invariant(!map.has(r.reference), `${label} 的 reference 重複：${r.reference}`);
    map.set(r.reference, r.amountCents);
  }
  return map;
}

/**
 * 判斷當日結算是否應被凍結。
 *
 * 供 `ExecuteProfitSharing` 使用（Q14：凍結是**真的拒絕**，不是只告警）。
 */
function shouldFreezeSettlement(report) {
  return Boolean(report && report.shouldFreezeSettlement);
}

module.exports = { compare, shouldFreezeSettlement, DiffType, ReconciliationTier };
