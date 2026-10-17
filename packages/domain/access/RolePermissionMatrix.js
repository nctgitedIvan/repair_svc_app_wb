'use strict';

const { Permission: P } = require('./Permission');
const { permissionsOfGroups } = require('./PermissionGroupMatrix');

/**
 * RolePermissionMatrix —— 角色 × 權限靜態矩陣。
 *
 * ⚠️ **`admin` 不在這裡**（docs/01 §4.8.4）。
 *    管理員的權限由 `users.permissions` 的**權限組聯集**決定，
 *    見 `PermissionGroupMatrix`。靜態矩陣只涵蓋另外三個角色。
 *
 * 這些清單是**A13 職責分離的編碼版本**。測試會逐條斷言，
 * 並斷言「刻意沒有的權限確實不存在」—— 有人日後隨手加了就會紅。
 */

const keys = (...list) => Object.freeze(list.map((x) => x.key));

const ROLE_PERMISSIONS = Object.freeze({
  customer: keys(
    P.ORDER_CREATE, P.ORDER_PAY, P.ORDER_READ, P.ORDER_CANCEL, P.ORDER_CONFIRM_COMPLETION,
    P.ORDER_RAISE_DISPUTE, P.ORDER_UPDATE_STATUS,
    P.REFUND_REQUEST, P.REFUND_READ,
    P.CATALOG_READ,
    P.WORKORDER_READ, P.WORKORDER_WRITE,
  ),

  cs_agent: keys(
    P.ORDER_READ, P.ORDER_READ_ALL, P.ORDER_ASSIGN,
    P.ORDER_CONFIRM_COMPLETION, P.ORDER_CANCEL, P.ORDER_RESOLVE_DISPUTE,
    P.ORDER_VOID, // 只能「發起」，需管理員確認（ApprovalPolicy）
    P.REFUND_REQUEST, P.REFUND_READ, P.REFUND_APPROVE_SMALL, P.REFUND_ESCALATE,
    P.CATALOG_READ,
    P.TECHNICIAN_READ, P.TECHNICIAN_READ_ALL,
    P.WORKORDER_READ, P.WORKORDER_WRITE, P.CONTACT_OPEN_CHANNEL,
    P.PROFIT_TERMS_READ, // A13 修正 1：唯讀，可答客戶疑問
    P.DASHBOARD_READ_DISPATCH,
    P.CONFIG_READ_BUSINESS,
  ),

  technician: keys(
    P.ORDER_READ, P.ORDER_ACCEPT, P.ORDER_REJECT, P.ORDER_ARRIVE,
    P.ORDER_COMPLETE, P.ORDER_UPDATE_STATUS,
    P.SETTLEMENT_READ_OWN, P.TECHNICIAN_READ,
    P.WORKORDER_READ, P.WORKORDER_WRITE, P.CONTACT_OPEN_CHANNEL,
    P.DASHBOARD_READ_OWN,
    P.CATALOG_READ,
  ),

  // ⚠️ admin 刻意不在這裡：它的權限來自權限組，見 PermissionGroupMatrix
});

/** 非 admin 角色的權限 key */
const NON_ADMIN_ROLES = Object.freeze(Object.keys(ROLE_PERMISSIONS));

/**
 * ⚠️ 師傅**刻意不具備**的權限。
 *
 * 這份清單的存在是為了讓測試可以斷言「它們真的不存在」。
 * 若有人日後把其中任何一項加進 `technician`，測試會紅。
 */
const TECHNICIAN_FORBIDDEN = keys(
  P.ORDER_READ_ALL,
  P.ORDER_ASSIGN, P.ORDER_CANCEL, P.ORDER_RESOLVE_DISPUTE, P.ORDER_VOID,
  P.REFUND_APPROVE_SMALL, P.REFUND_APPROVE_LARGE, P.REFUND_REQUEST,
  P.SETTLEMENT_READ_ALL,
  P.PROFIT_TERMS_READ, P.PROFIT_TERMS_MANAGE,
  P.CATALOG_MANAGE, P.TECHNICIAN_MANAGE, P.TECHNICIAN_READ_ALL,
  P.DASHBOARD_READ_ALL, P.DASHBOARD_READ_DISPATCH,
  P.CONFIG_MANAGE, P.USER_MANAGE_ROLE, P.AUDIT_READ,
);

function roleHas(role, permissionKey) {
  const list = ROLE_PERMISSIONS[role];
  return Array.isArray(list) && list.includes(permissionKey);
}

/**
 * 解析 actor 的**有效權限集合**。
 *
 * - `customer` / `cs_agent` / `technician` → 靜態矩陣
 * - `admin` → `actor.permissions`（權限組）的聯集
 *
 * @param {{ role: string, permissions?: string[] }} actor
 * @returns {Set<string>}
 */
function effectivePermissions(actor) {
  if (!actor || typeof actor.role !== 'string') {
    throw new TypeError('effectivePermissions 需要 actor.role');
  }
  if (actor.role === 'admin') {
    return permissionsOfGroups(actor.permissions || []);
  }
  return new Set(ROLE_PERMISSIONS[actor.role] || []);
}

module.exports = {
  ROLE_PERMISSIONS,
  NON_ADMIN_ROLES,
  TECHNICIAN_FORBIDDEN,
  roleHas,
  effectivePermissions,
};
