'use strict';

const { Permission } = require('./Permission');

/**
 * PermissionGroupMatrix —— 管理員的權限組。
 *
 * `role_type='admin'` **不再代表「什麼都能做」**（docs/01 §4.8.4）。
 * 實際權限 = `users.permissions` 陣列中各權限組的**聯集**。
 *
 * ⚠️ 權限組只管「**能不能做這類事**」（RBAC）。
 *    「**對這一筆、在當下能不能做**」（ABAC）由 constraints 決定 ——
 *    **`admin.full` 也不例外**（例如「不得超過已付金額」對它一樣生效）。
 */

const P = Permission;
const keys = (...list) => list.map((p) => p.key);

const PermissionGroup = Object.freeze({
  FULL: 'admin.full',
  FINANCE: 'admin.finance',
  OPERATIONS: 'admin.operations',
  SUPPORT: 'admin.support',
});

const ALL_KEYS = Object.freeze(Object.values(P).map((p) => p.key));

const GROUP_PERMISSIONS = Object.freeze({
  /** 全部權限。仍受 constraints 約束 */
  [PermissionGroup.FULL]: ALL_KEYS,

  /** 財務：退款審批、對帳、帳務、稽核 */
  [PermissionGroup.FINANCE]: Object.freeze(
    keys(
      P.ORDER_READ, P.ORDER_READ_ALL,
      P.REFUND_READ, P.REFUND_APPROVE_SMALL, P.REFUND_APPROVE_LARGE, P.REFUND_ESCALATE,
      P.SETTLEMENT_READ_ALL, P.PROFIT_TERMS_READ,
      P.DASHBOARD_READ_ALL,
      P.AUDIT_READ, P.CONFIG_READ_BUSINESS,
    ),
  ),

  /** 營運：商品／服務、師傅、訂單、報表 */
  [PermissionGroup.OPERATIONS]: Object.freeze(
    keys(
      P.ORDER_READ, P.ORDER_READ_ALL, P.ORDER_ASSIGN, P.ORDER_CANCEL,
      P.ORDER_CONFIRM_COMPLETION, P.ORDER_RESOLVE_DISPUTE, P.ORDER_VOID,
      P.REFUND_READ,
      P.CATALOG_READ, P.CATALOG_MANAGE,
      P.TECHNICIAN_READ, P.TECHNICIAN_READ_ALL, P.TECHNICIAN_MANAGE,
      P.SETTLEMENT_READ_ALL, P.PROFIT_TERMS_READ,
      P.DASHBOARD_READ_ALL, P.DASHBOARD_READ_DISPATCH,
      P.CONFIG_READ_BUSINESS, P.AUDIT_READ,
    ),
  ),

  /** 客服支援：訂單查詢、派單、工單、小額退款 */
  [PermissionGroup.SUPPORT]: Object.freeze(
    keys(
      P.ORDER_READ, P.ORDER_READ_ALL, P.ORDER_ASSIGN,
      P.ORDER_CONFIRM_COMPLETION, P.ORDER_CANCEL, P.ORDER_RESOLVE_DISPUTE,
      P.REFUND_REQUEST, P.REFUND_READ, P.REFUND_APPROVE_SMALL, P.REFUND_ESCALATE,
      P.TECHNICIAN_READ, P.TECHNICIAN_READ_ALL,
      P.WORKORDER_READ, P.WORKORDER_WRITE, P.CONTACT_OPEN_CHANNEL,
      P.PROFIT_TERMS_READ,
      P.DASHBOARD_READ_DISPATCH, P.CONFIG_READ_BUSINESS,
    ),
  ),
});

const ALL_GROUPS = Object.freeze(Object.values(PermissionGroup));

/**
 * 把權限組陣列攤平成權限 key 的集合。
 *
 * @param {string[]} groups
 * @returns {Set<string>}
 * @throws {TypeError} 未知的權限組（設定錯誤要讓它爆，不要靜默忽略）
 */
function permissionsOfGroups(groups) {
  if (!Array.isArray(groups)) {
    throw new TypeError(`permissions 必須是陣列，收到：${typeof groups}`);
  }
  const result = new Set();
  for (const group of groups) {
    const list = GROUP_PERMISSIONS[group];
    if (!list) {
      throw new TypeError(`未知的權限組：${group}（可用：${ALL_GROUPS.join(' / ')}）`);
    }
    for (const key of list) result.add(key);
  }
  return result;
}

module.exports = { PermissionGroup, GROUP_PERMISSIONS, ALL_GROUPS, permissionsOfGroups };
