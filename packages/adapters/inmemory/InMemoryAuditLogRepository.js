'use strict';

const { appendEntry } = require('@repair/domain/audit/AuditChain');

/**
 * InMemoryAuditLogRepository —— AuditLogRepository 的測試替身。
 *
 * 行為與 CloudDB 版一致：
 *  - 只 append（沒有 update／delete）
 *  - 用 domain 的 `AuditChain.appendEntry()` 計算 seq／prevHash／hash
 *  - 同一條鏈的 append 是序列化的（本檔的同步區段即為原子）
 */
class InMemoryAuditLogRepository {
  /** @type {Map<string, object[]>} chainId → records */
  #chains = new Map();

  async append(chainId, entry) {
    if (typeof chainId !== 'string' || chainId.length === 0) {
      throw new TypeError('AuditLog.append(chainId, entry) 需要非空 chainId');
    }
    if (!entry || typeof entry !== 'object') {
      throw new TypeError('AuditLog.append(chainId, entry) 需要 entry 物件');
    }

    const records = this.#chains.get(chainId) || [];
    const prev = records.length > 0 ? records[records.length - 1] : null;
    // ⚠️ chainId 必須一起進 hash（verifyChain 會把整筆記錄餵回去）
    const record = appendEntry(prev, { ...entry, chainId });

    records.push(record);
    this.#chains.set(chainId, records);
    return clone(record);
  }

  async listByChain(chainId) {
    if (typeof chainId !== 'string' || chainId.length === 0) return [];
    return (this.#chains.get(chainId) || []).map(clone);
  }

  /** 測試輔助 */
  size(chainId) {
    return (this.#chains.get(chainId) || []).length;
  }

  /** 測試輔助：直接取得內部記錄（模擬 DB 被篡改） */
  rawChain(chainId) {
    return (this.#chains.get(chainId) || []).map(clone);
  }
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

module.exports = { InMemoryAuditLogRepository };
