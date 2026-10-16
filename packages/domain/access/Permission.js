'use strict';

/**
 * Permission —— 權限註冊表。
 *
 * ⚠️ **每個權限都必須宣告 `constraints`。**
 *    - 空陣列 `[]` 代表**刻意無限制**（已在程式碼中明示意圖）
 *    - **缺少欄位 → `AccessPolicy` 拋 `MisconfiguredPermissionError`，拒絕執行**
 *
 * 為什麼要這樣設計（docs/01 §4.7.4）：
 *   若「沒登記 constraint」等於「無額外限制」，那麼新增權限時忘了登記，
 *   會**靜默地變成資安漏洞** —— 測試看不到、code review 容易漏、
 *   只有在資安事件裡才會發現。把「忘記」變成「當場爆」是唯一可靠的做法。
 *
 * 新增權限時的檢查清單：
 *   1. 涉及「某一筆資源」嗎？   → `OwnershipConstraint`
 *   2. 會改變訂單狀態嗎？       → `StateConstraint`
 *   3. 涉及金額嗎？             → `AmountConstraint` / `PeriodConstraint`
 *   4. 有職責分離要求嗎？       → `SoDConstraint`
 *   5. 需要雙人覆核嗎？         → `ApprovalPolicy`
 *   6. 有區域範圍嗎？           → `RegionConstraint`
 *   7. 都不是？                 → 明確寫 `constraints: []`
 */

const p = (key, constraints) => Object.freeze({ key, constraints: Object.freeze(constraints) });

const Permission = Object.freeze({
  // ── 訂單 ──
  ORDER_CREATE: p('orders.create', []),
  ORDER_READ: p('orders.read', ['OwnershipConstraint']),
  ORDER_READ_ALL: p('orders.read_all', []),
  ORDER_ASSIGN: p('orders.assign', ['RegionConstraint', 'StateConstraint']),
  ORDER_ACCEPT: p('orders.accept', ['OwnershipConstraint', 'StateConstraint']),
  ORDER_REJECT: p('orders.reject', ['OwnershipConstraint', 'StateConstraint']),
  ORDER_ARRIVE: p('orders.arrive', ['OwnershipConstraint', 'StateConstraint']),
  ORDER_COMPLETE: p('orders.complete', ['OwnershipConstraint', 'StateConstraint']),
  ORDER_CONFIRM_COMPLETION: p('orders.confirm_completion', ['OwnershipConstraint', 'StateConstraint']),
  ORDER_CANCEL: p('orders.cancel', ['OwnershipConstraint', 'StateConstraint', 'PeriodConstraint']),
  ORDER_UPDATE_STATUS: p('orders.update_status', ['OwnershipConstraint', 'StateConstraint']),
  ORDER_RAISE_DISPUTE: p('orders.raise_dispute', ['OwnershipConstraint', 'StateConstraint']),
  ORDER_RESOLVE_DISPUTE: p('orders.resolve_dispute', ['StateConstraint']),
  /** 平台主動作廢（軟刪除的唯一實作方式）。客服發起 + 管理員確認 */
  ORDER_VOID: p('orders.void', ['StateConstraint', 'PeriodConstraint', 'ApprovalPolicy']),
  /** 沖銷：關帳期間**唯一允許**的金額變更（PeriodConstraint 對 reasonCode=REVERSAL 放行） */
  ORDER_REVERSE: p('orders.reverse', ['PeriodConstraint']),

  // ── 退款 ──
  REFUND_REQUEST: p('refunds.request', ['OwnershipConstraint']),
  REFUND_READ: p('refunds.read', []),
  REFUND_APPROVE_SMALL: p('refunds.approve_small', ['AmountConstraint']),
  /** ⚠️ SoD **只登記在這裡** —— approve_small 的單人審批是設計，不是違規 */
  REFUND_APPROVE_LARGE: p('refunds.approve_large', ['AmountConstraint', 'SoDConstraint']),
  REFUND_ESCALATE: p('refunds.escalate', []),

  // ── 結算 ──
  SETTLEMENT_READ_OWN: p('settlement.read_own', ['OwnershipConstraint']),
  SETTLEMENT_READ_ALL: p('settlement.read_all', []),
  PROFIT_TERMS_READ: p('profit_terms.read', []),
  PROFIT_TERMS_MANAGE: p('profit_terms.manage', ['ApprovalPolicy']),

  // ── 目錄 ──
  CATALOG_READ: p('catalog.read', []),
  CATALOG_MANAGE: p('catalog.manage', ['ApprovalPolicy']),
  TECHNICIAN_READ: p('technicians.read', ['OwnershipConstraint']),
  TECHNICIAN_READ_ALL: p('technicians.read_all', ['RegionConstraint']),
  TECHNICIAN_MANAGE: p('technicians.manage', []),

  // ── 工單與聯繫 ──
  WORKORDER_READ: p('workorder.read', ['OwnershipConstraint']),
  WORKORDER_WRITE: p('workorder.write', ['OwnershipConstraint']),
  CONTACT_OPEN_CHANNEL: p('contact.open_channel', ['OwnershipConstraint', 'StateConstraint']),

  // ── 報表 ──
  DASHBOARD_READ_ALL: p('dashboard.read_all', []),
  DASHBOARD_READ_OWN: p('dashboard.read_own', ['OwnershipConstraint']),
  DASHBOARD_READ_DISPATCH: p('dashboard.read_dispatch', ['RegionConstraint']),

  // ── 系統 ──
  CONFIG_READ_BUSINESS: p('config.read_business', []),
  CONFIG_MANAGE: p('config.manage', []),
  /** 管理員的增刪與權限組變更 —— 需另一位超級管理員確認（Q-D） */
  USER_MANAGE_ROLE: p('users.manage_role', ['ApprovalPolicy']),
  AUDIT_READ: p('audit.read', []),
});

const ALL_PERMISSIONS = Object.freeze(Object.values(Permission));
const ALL_KEYS = Object.freeze(ALL_PERMISSIONS.map((x) => x.key));

/** 依 `key` 查詢權限定義；找不到回 `null` */
function byKey(key) {
  return ALL_PERMISSIONS.find((x) => x.key === key) || null;
}

module.exports = { Permission, ALL_PERMISSIONS, ALL_KEYS, byKey };
