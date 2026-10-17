'use strict';

/**
 * appendOrderAudit —— 把訂單操作寫入哈希鏈。
 *
 * `chainId = order:<orderId>`（Q9 的分段鏈）。
 * 沒有注入 auditLogRepository 時靜默跳過（測試可精簡 container）。
 */
async function appendOrderAudit({
  auditLogRepository,
  orderId,
  actor,
  action,
  at,
  reasonCode = null,
  details = null,
}) {
  if (!auditLogRepository) return null;
  if (!orderId || !actor) throw new TypeError('appendOrderAudit 需要 orderId 與 actor');
  if (!Number.isInteger(at)) throw new TypeError('appendOrderAudit 需要整數 at');

  return auditLogRepository.append(`order:${orderId}`, {
    actorId: actor.id,
    actorRole: actor.role,
    action,
    targetType: 'order',
    targetId: orderId,
    reasonCode,
    details,
    at,
  });
}

module.exports = { appendOrderAudit };
