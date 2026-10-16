'use strict';

const { MisconfiguredPermissionError } = require('@repair/shared-kernel/Errors');
const { Decision, Reason } = require('./Decision');
const { byKey } = require('./Permission');
const { effectivePermissions } = require('./RolePermissionMatrix');
const { OwnershipConstraint } = require('./constraints/OwnershipConstraint');
const { StateConstraint } = require('./constraints/StateConstraint');
const { RegionConstraint } = require('./constraints/RegionConstraint');
const { AmountConstraint } = require('./constraints/AmountConstraint');
const { PeriodConstraint } = require('./constraints/PeriodConstraint');
const { SoDConstraint } = require('./constraints/SoDConstraint');
const { ApprovalPolicy } = require('./ApprovalPolicy');

/**
 * AccessPolicy —— 存取判斷的**唯一入口**。
 *
 * **純函式**：相同輸入必得相同輸出。無 I/O、無 Port、無時鐘、無隨機。
 * 需要的所有資料（訂單、配額、關帳日、覆核紀錄）一律**以參數傳入**。
 *
 * 判斷流程（docs/01 §4.7.3）：
 *   ① RBAC —— actor 的有效權限集合含這個權限嗎？
 *   ② ABAC —— 依序跑該權限宣告的 constraints
 *
 * 對應 docs/01-目標架構.md §4.7。
 */

/** constraint 名稱 → 實作。這是唯一的註冊點。 */
const CONSTRAINT_REGISTRY = Object.freeze({
  OwnershipConstraint,
  StateConstraint,
  RegionConstraint,
  AmountConstraint,
  PeriodConstraint,
  SoDConstraint,
  ApprovalPolicy,
});

const REGISTERED_NAMES = Object.freeze(Object.keys(CONSTRAINT_REGISTRY));

/**
 * 驗證一個權限定義是否設定完整。
 *
 * ⚠️ **這是本設計的核心防線**：把「忘記宣告 constraints」從
 *    **靜默的資安漏洞**變成**當場失敗的錯誤**。
 *    若缺少宣告就當成「無限制」，新增權限時的疏漏在測試與 code review
 *    都不會現形，只會在資安事件裡現形。
 *
 * 獨立成函式是為了**可測試** —— `Permission` 的定義是凍結的，
 * 測試無法把它改成壞的來驗證守衛，只能直接呼叫本函式。
 *
 * @param {{ key?: string, constraints?: unknown }} definition
 * @param {string} [permissionKey]
 * @throws {MisconfiguredPermissionError}
 */
function validatePermissionDefinition(definition, permissionKey = definition && definition.key) {
  if (!definition) {
    throw new MisconfiguredPermissionError({
      permissionKey,
      problem: '權限未在 Permission 註冊表中定義',
    });
  }
  if (!Array.isArray(definition.constraints)) {
    throw new MisconfiguredPermissionError({
      permissionKey,
      problem: '缺少 constraints 欄位（空陣列代表刻意無限制，但欄位必須存在）',
    });
  }
  for (const name of definition.constraints) {
    if (!CONSTRAINT_REGISTRY[name]) {
      throw new MisconfiguredPermissionError({
        permissionKey,
        problem: '宣告了未註冊的 constraint',
        unknownConstraint: name,
      });
    }
  }
  return definition;
}

/**
 * @param {{ id: string, role: string, technicianId?: string, regions?: string[], permissions?: string[], dailyRefundBudget?: object }} actor
 * @param {string} permissionKey 例如 `'orders.accept'`
 * @param {object} [resource] 判斷所需的資料快照
 * @param {{ now?: number }} [context]
 * @returns {Decision}
 * @throws {MisconfiguredPermissionError} 權限表設定錯誤（**程式缺陷，必須爆**）
 */
function can(actor, permissionKey, resource = {}, context = {}) {
  if (!actor || typeof actor.role !== 'string') {
    return Decision.deny(Reason.ROLE_NOT_PERMITTED, { hint: 'actor 缺少 role' });
  }

  // ①② 定義存在性與 constraints 完整性（設定錯誤一律拋錯）
  const definition = validatePermissionDefinition(byKey(permissionKey), permissionKey);

  // ③ RBAC
  const granted = effectivePermissions(actor);
  if (!granted.has(permissionKey)) {
    return Decision.deny(Reason.ROLE_NOT_PERMITTED, { role: actor.role, permission: permissionKey });
  }

  // ④ ABAC：依序跑 constraints
  const ctx = { ...context, permissionKey };
  for (const name of definition.constraints) {
    const decision = CONSTRAINT_REGISTRY[name].check(actor, resource, ctx);
    if (!decision.allowed) return decision;
  }

  return Decision.allow();
}

/** 便利方法：回傳布林（多數呼叫端只在意能不能做） */
function canBool(actor, permissionKey, resource, context) {
  return can(actor, permissionKey, resource, context).allowed;
}

/** 便利方法：列出 actor 在此資源上「可以做」的權限（供 UI 決定顯示哪些按鈕） */
function allowedPermissions(actor, permissionKeys, resource = {}, context = {}) {
  return permissionKeys.filter((key) => canBool(actor, key, resource, context));
}

module.exports = {
  can,
  canBool,
  allowedPermissions,
  validatePermissionDefinition,
  CONSTRAINT_REGISTRY,
  REGISTERED_NAMES,
};
