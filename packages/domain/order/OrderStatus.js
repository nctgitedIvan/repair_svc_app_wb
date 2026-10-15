'use strict';

/**
 * OrderStatus —— 訂單狀態列舉。
 *
 * 對應 docs/01-目標架構.md §3.3。
 *
 * 設計要點：**每個語意都有獨立數值**。
 * 這正是為了修正 baseline 的缺陷 —— 原專案 pages/order/config.js 中
 * PAYMENT_TIMEOUT / CANCELED_NOT_PAYMENT / CANCELED_PAYMENT / CANCELED_REJECTION
 * 四個不同意義全部等於 80，導致「逾時率」與「取消率」永遠算不出來。
 */

const OrderStatus = Object.freeze({
  PENDING_PAYMENT: { value: 10, key: 'PENDING_PAYMENT', label: '待付款', terminal: false },
  PAID_PENDING_ASSIGN: { value: 20, key: 'PAID_PENDING_ASSIGN', label: '已付款待派單', terminal: false },
  ASSIGNED_PENDING_ACCEPT: { value: 30, key: 'ASSIGNED_PENDING_ACCEPT', label: '已派單待接單', terminal: false },
  ACCEPTED_PENDING_VISIT: { value: 40, key: 'ACCEPTED_PENDING_VISIT', label: '已接單待上門', terminal: false },
  IN_SERVICE: { value: 50, key: 'IN_SERVICE', label: '服務中', terminal: false },
  PENDING_ACCEPTANCE: { value: 60, key: 'PENDING_ACCEPTANCE', label: '待驗收', terminal: false },
  /** 爭議中：**會凍結分帳**（見 canExecuteProfitSharing） */
  DISPUTED: { value: 65, key: 'DISPUTED', label: '爭議中', terminal: false },
  COMPLETED: { value: 70, key: 'COMPLETED', label: '已完成', terminal: false },

  CANCELED_UNPAID: { value: 81, key: 'CANCELED_UNPAID', label: '已取消－客戶主動（未付款）', terminal: true },
  CANCELED_PAID_REFUNDED: { value: 82, key: 'CANCELED_PAID_REFUNDED', label: '已取消－客服取消（已退款）', terminal: true },
  EXPIRED_UNPAID: { value: 83, key: 'EXPIRED_UNPAID', label: '已逾時－未付款', terminal: true },
  EXPIRED_UNASSIGNED_REFUNDED: { value: 84, key: 'EXPIRED_UNASSIGNED_REFUNDED', label: '已逾時－未派單／未接單（已退款）', terminal: true },
  CLOSED_REFUNDED: { value: 91, key: 'CLOSED_REFUNDED', label: '已結案－退款完成', terminal: true },
});

/** 合法轉移表：from → Set<to>。狀態機的唯一真實來源。 */
const TRANSITIONS = Object.freeze({
  PENDING_PAYMENT: ['PAID_PENDING_ASSIGN', 'CANCELED_UNPAID', 'EXPIRED_UNPAID'],
  PAID_PENDING_ASSIGN: ['ASSIGNED_PENDING_ACCEPT', 'CANCELED_PAID_REFUNDED', 'EXPIRED_UNASSIGNED_REFUNDED'],
  ASSIGNED_PENDING_ACCEPT: ['ACCEPTED_PENDING_VISIT', 'PAID_PENDING_ASSIGN', 'EXPIRED_UNASSIGNED_REFUNDED'],
  ACCEPTED_PENDING_VISIT: ['IN_SERVICE', 'PAID_PENDING_ASSIGN'],
  IN_SERVICE: ['PENDING_ACCEPTANCE', 'DISPUTED'],
  PENDING_ACCEPTANCE: ['COMPLETED', 'IN_SERVICE', 'DISPUTED'],
  DISPUTED: ['COMPLETED', 'CLOSED_REFUNDED', 'IN_SERVICE'],
  COMPLETED: ['DISPUTED', 'CLOSED_REFUNDED'],
  CANCELED_UNPAID: [],
  CANCELED_PAID_REFUNDED: [],
  EXPIRED_UNPAID: [],
  EXPIRED_UNASSIGNED_REFUNDED: [],
  CLOSED_REFUNDED: [],
});

/** 值 → key 的反查表（供 adapter 從資料庫的數字還原） */
const BY_VALUE = Object.freeze(
  Object.fromEntries(Object.values(OrderStatus).map((s) => [s.value, s])),
);

/**
 * 從資料庫的數字還原成狀態物件。
 * @throws {RangeError} 未知數值（寧可大聲失敗，也不要靜默變成 undefined）
 */
function fromValue(value) {
  const status = BY_VALUE[value];
  if (!status) {
    throw new RangeError(`未知的訂單狀態數值：${JSON.stringify(value)}`);
  }
  return status;
}

function fromKey(key) {
  const status = OrderStatus[key];
  if (!status) throw new RangeError(`未知的訂單狀態鍵：${JSON.stringify(key)}`);
  return status;
}

function canTransition(from, to) {
  const allowed = TRANSITIONS[from.key];
  return Array.isArray(allowed) && allowed.includes(to.key);
}

function isTerminal(status) {
  return status.terminal === true;
}

/**
 * 分帳是否可執行。
 *
 * 這是 §3.3「爭議中」規則的可執行版本：
 * **DISPUTED 必須凍結分帳** —— 否則爭議期間錢已經分給師傅，退款時要追回，極難處理。
 */
function canExecuteProfitSharing(status) {
  return status.key === 'COMPLETED';
}

module.exports = {
  OrderStatus,
  TRANSITIONS,
  fromValue,
  fromKey,
  canTransition,
  isTerminal,
  canExecuteProfitSharing,
};
