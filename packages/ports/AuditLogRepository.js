'use strict';

/**
 * AuditLogRepository —— 稽核日誌的持久化契約。
 *
 * ## 只 append
 *
 * 本 Port **刻意沒有 update／delete**。稽核日誌一旦寫入就只能追加；
 * 即使資料庫權限無法限制 update，應用層也沒有這個能力。
 *
 * ## 哈希鏈
 *
 * `append()` 會用 domain 的 `AuditChain.appendEntry()` 計算 `prevHash`／`hash`／`seq`。
 * 呼叫端只需提供業務欄位，不要自己算 hash。
 *
 * ## 分段鏈（Q9）
 *
 * `chainId = order:<orderId>` 或 `daily:YYYY-MM-DD`。
 * 同一條鏈的並發 append 由呼叫端序列化（同一訂單的操作本來就不會並發）。
 *
 * 實作：CloudDBAuditLogRepository（正式）、InMemoryAuditLogRepository（測試）
 */
const AuditLogRepository = Object.freeze({
  name: 'AuditLogRepository',
  methods: Object.freeze(['append', 'listByChain']),
  contract: Object.freeze({
    /**
     * 追加一筆稽核記錄。
     *
     * @param {string} chainId 鏈識別碼（`order:<id>`／`daily:YYYY-MM-DD`）
     * @param {object} entry 業務欄位（例：`{ actorId, actorRole, action, targetType,
     *        targetId, reasonCode, details, at }`）
     * @returns {Promise<object>} 完整記錄（含 `seq`／`prevHash`／`hash`／`chainId`）
     */
    append: '(chainId: string, entry: object): Promise<AuditRecord>',

    /**
     * 取得一條鏈的全部記錄（依 `seq` 升序）。
     * @returns {Promise<object[]>}
     */
    listByChain: '(chainId: string): Promise<AuditRecord[]>',
  }),
});

module.exports = { AuditLogRepository };
