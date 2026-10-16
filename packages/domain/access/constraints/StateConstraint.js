'use strict';

const { Decision, Reason } = require('../Decision');
const { OrderStatus, fromValue, fromKey, canTransition } = require('../../order/OrderStatus');

/**
 * StateConstraint —— 「**誰**能把訂單從什麼狀態轉到什麼狀態」。
 *
 * ⚠️ **與 `OrderStateMachine` 的職責分工（刻意畫清）**：
 *
 * | | `OrderStateMachine` | `StateConstraint`（本檔） |
 * |---|---|---|
 * | 回答 | 「這個轉移**可不可能**」 | 「**這個角色**能不能做這個轉移」 |
 * | 依賴 | 只有 `TRANSITIONS` | 角色 + `TARGET_RULES` + `TRANSITIONS` |
 * | 誰呼叫 | 聚合的方法 | `AccessPolicy` |
 *
 * **`TRANSITIONS` 仍是唯一真實來源** —— 本檔只加上「角色」這一維，
 * 不重新定義可達性。測試會斷言兩者不衝突。
 */

/** 角色 × 權限 → 允許的目標狀態（key） */
const TARGET_RULES = Object.freeze({
  technician: Object.freeze({
    'orders.accept': ['ACCEPTED_PENDING_VISIT'],
    'orders.reject': ['PAID_PENDING_ASSIGN'],
    'orders.arrive': ['IN_SERVICE'],
    'orders.complete': ['PENDING_ACCEPTANCE'],
    'orders.update_status': ['ACCEPTED_PENDING_VISIT', 'PAID_PENDING_ASSIGN', 'IN_SERVICE', 'PENDING_ACCEPTANCE'],
    'contact.open_channel': ['ACCEPTED_PENDING_VISIT', 'IN_SERVICE'],
  }),

  customer: Object.freeze({
    'orders.cancel': ['CANCELED_UNPAID'],
    'orders.confirm_completion': ['COMPLETED'],
    'orders.raise_dispute': ['DISPUTED'],
    'orders.update_status': ['CANCELED_UNPAID', 'COMPLETED', 'DISPUTED'],
  }),

  cs_agent: Object.freeze({
    'orders.assign': ['ASSIGNED_PENDING_ACCEPT'],
    'orders.confirm_completion': ['COMPLETED'],
    'orders.cancel': ['CANCELED_PAID_REFUNDED'],
    'orders.resolve_dispute': ['COMPLETED', 'CLOSED_REFUNDED', 'IN_SERVICE'],
    'orders.void': ['VOIDED'],
    'contact.open_channel': ['ASSIGNED_PENDING_ACCEPT', 'ACCEPTED_PENDING_VISIT', 'IN_SERVICE'],
  }),

  admin: Object.freeze({
    'orders.assign': ['ASSIGNED_PENDING_ACCEPT'],
    'orders.confirm_completion': ['COMPLETED'],
    'orders.cancel': ['CANCELED_PAID_REFUNDED'],
    'orders.resolve_dispute': ['COMPLETED', 'CLOSED_REFUNDED', 'IN_SERVICE'],
    'orders.void': ['VOIDED'],
    'orders.reverse': ['CLOSED_REFUNDED'],
  }),

  /** 系統（定時任務、支付回調）—— 非使用者操作 */
  system: Object.freeze({
    'orders.mark_paid': ['PAID_PENDING_ASSIGN'],
    'orders.expire': ['EXPIRED_UNPAID', 'EXPIRED_UNASSIGNED_REFUNDED'],
    'orders.auto_complete': ['COMPLETED'],
  }),
});

function normalizeTarget(target) {
  if (typeof target === 'string') return fromKey(target);
  if (typeof target === 'number') return fromValue(target);
  if (target && typeof target === 'object' && 'key' in target) return target;
  return null;
}

const StateConstraint = Object.freeze({
  name: 'StateConstraint',

  /**
   * @param {{ role: string }} actor
   * @param {object} resource 需含 `order`；可選 `targetStatus`
   * @param {{ permissionKey: string }} context
   */
  check(actor, resource = {}, context = {}) {
    const order = resource.order;
    if (!order) return Decision.deny(Reason.RESOURCE_MISSING, { need: 'order' });

    const permissionKey = context.permissionKey;
    const rules = TARGET_RULES[actor.role];
    const allowedTargets = rules && rules[permissionKey];

    if (!allowedTargets) {
      return Decision.deny(Reason.ROLE_CANNOT_TRANSITION, { role: actor.role, permission: permissionKey });
    }

    // 沒有指定目標狀態 → 只要該角色在此權限下有可用的目標即可
    if (resource.targetStatus === undefined || resource.targetStatus === null) {
      return Decision.allow();
    }

    const target = normalizeTarget(resource.targetStatus);
    if (!target) {
      return Decision.deny(Reason.RESOURCE_MISSING, { need: 'valid targetStatus', received: resource.targetStatus });
    }

    // ① 該角色在此權限下允許的目標
    if (!allowedTargets.includes(target.key)) {
      return Decision.deny(Reason.TARGET_NOT_ALLOWED_FOR_ROLE, {
        target: target.key, allowed: allowedTargets,
      });
    }

    // ② 狀態機是否允許這個轉移（唯一真實來源）
    const current = typeof order.status === 'object' && order.status !== null
      ? order.status
      : fromValue(order.statusValue);

    if (!canTransition(current, target)) {
      return Decision.deny(Reason.ILLEGAL_STATE_TRANSITION, {
        from: current.key, to: target.key, allowed: current.key ? undefined : null,
      });
    }

    return Decision.allow();
  },
});

module.exports = { StateConstraint, TARGET_RULES };
