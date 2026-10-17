'use strict';

/**
 * audit_logs 集合的 row ↔ AuditRecord 映射。
 *
 * ⚠️ 雜湊是對「entry 的原始欄位 + seq」計算的，因此 row 必須保存
 *    **完整的 payload**，不能只挑幾個欄位。
 *    `payload` 內的欄位名與 domain 看到的一致，才能用 `verifyChain()` 驗證。
 *
 * 其餘欄位（actor_id／target_type…）是**反規範化**的查詢用欄位，
 * 不參與雜湊。
 */

function toRow(record, chainId) {
  const { prevHash, hash, chainId: _chainId, seq, ...payload } = record;
  return {
    chain_id: chainId,
    seq,
    prev_hash: prevHash,
    hash,
    payload,
    // 查詢用（不參與雜湊）
    actor_id: payload.actorId || null,
    actor_role: payload.actorRole || null,
    action: payload.action || null,
    target_type: payload.targetType || null,
    target_id: payload.targetId || null,
    created_at: Number.isInteger(payload.at) ? payload.at : null,
  };
}

function fromRow(row) {
  if (!row) return null;
  return {
    ...(row.payload || {}),
    seq: row.seq,
    prevHash: row.prev_hash,
    hash: row.hash,
    chainId: row.chain_id,
  };
}

module.exports = { toRow, fromRow };
