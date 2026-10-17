'use strict';

const { appendEntry } = require('@repair/domain/audit/AuditChain');
const { toRow, fromRow } = require('./mappers/auditLog');

/**
 * CloudDBAuditLogRepository —— 稽核日誌的雲端實作（只寫不跑）。
 *
 * ## 為什麼 seq 用 IdSequenceRepository
 *
 * 雲開發事務不允許 `where`／`orderBy`，因此無法在事務內查「鏈尾」。
 * 做法：
 *   1. 用 `id_sequences` 的原子遞增取得下一個 seq。
 *   2. 在事務外讀取 seq-1 的那筆記錄（有的話）。
 *   3. 計算 hash、append。
 *
 * ⚠️ **同一條鏈的並發 append 必須由呼叫端序列化**（同一訂單的操作本來就不會並發）。
 *    跨鏈 append 互不影響。
 *
 * @param {{ client: object, idSequence: { next: Function } }} deps
 */
function createCloudDBAuditLogRepository({ client, idSequence } = {}) {
  if (!client || typeof client.collection !== 'function') {
    throw new TypeError('CloudDBAuditLogRepository 需要 CloudDBClient');
  }
  if (!idSequence || typeof idSequence.next !== 'function') {
    throw new TypeError('CloudDBAuditLogRepository 需要 IdSequenceRepository');
  }

  const collection = () => client.collection('audit_logs');

  async function findPrevious(chainId, seq) {
    const result = await collection()
      .where({ chain_id: chainId, seq })
      .limit(1)
      .get();
    const row = result && Array.isArray(result.data) ? result.data[0] : null;
    return row ? fromRow(row) : null;
  }

  return {
    async append(chainId, entry) {
      if (typeof chainId !== 'string' || chainId.length === 0) {
        throw new TypeError('AuditLog.append(chainId, entry) 需要非空 chainId');
      }
      if (!entry || typeof entry !== 'object') {
        throw new TypeError('AuditLog.append(chainId, entry) 需要 entry 物件');
      }

      // 1-based → 0-based；第一筆 seq 為 0
      const nextOneBased = await idSequence.next(`audit:${chainId}`);
      const seq = nextOneBased - 1;
      const prev = seq === 0 ? null : await findPrevious(chainId, seq - 1);
      // ⚠️ chainId 必須一起進 hash（verifyChain 會把整筆記錄餵回去）
      const record = appendEntry(prev, { ...entry, chainId });

      await collection().add({ data: toRow(record, chainId) });
      return record;
    },

    async listByChain(chainId) {
      if (typeof chainId !== 'string' || chainId.length === 0) return [];
      const result = await collection()
        .where({ chain_id: chainId })
        .orderBy('seq', 'asc')
        .limit(1000)
        .get();
      return (result && Array.isArray(result.data) ? result.data : []).map(fromRow);
    },
  };
}

module.exports = { createCloudDBAuditLogRepository };
