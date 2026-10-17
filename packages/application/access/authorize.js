'use strict';

const { Result } = require('@repair/shared-kernel/Result');
const { can } = require('@repair/domain/access/AccessPolicy');

/**
 * authorize —— 第 2／3 層校驗的統一入口（P3）。
 *
 * Use Case 在執行前呼叫：
 * ```js
 * const denied = authorize(actor, 'orders.assign', { order, targetStatus: 'ASSIGNED_PENDING_ACCEPT' });
 * if (denied) return denied;
 * ```
 *
 * @returns {Result|null} 允許回 `null`；拒絕回 `Result.forbidden`
 */
function authorize(actor, permissionKey, resource = {}, context = {}) {
  const decision = can(actor, permissionKey, resource, context);
  if (decision.allowed) return null;

  return Result.fail('FORBIDDEN', '無權限執行此操作', {
    reason: decision.reason,
    permission: permissionKey,
  });
}

module.exports = { authorize };
