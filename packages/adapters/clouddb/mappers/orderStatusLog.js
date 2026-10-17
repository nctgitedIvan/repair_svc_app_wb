'use strict';

/** order_status_logs 集合的 row ↔ OrderStatusLog.toJSON() 映射。 */

function toRow(log, orderId, index) {
  return {
    order_id: orderId,
    log_index: index,
    from_key: log.fromKey,
    to_key: log.toKey,
    actor_id: log.actorId,
    actor_role: log.actorRole,
    at: log.at,
    reason: log.reason || null,
  };
}

function fromRow(row) {
  return {
    fromKey: row.from_key,
    toKey: row.to_key,
    actorId: row.actor_id,
    actorRole: row.actor_role,
    at: row.at,
    reason: row.reason || null,
  };
}

module.exports = { toRow, fromRow };
