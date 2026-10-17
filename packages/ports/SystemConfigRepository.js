'use strict';

/**
 * SystemConfigRepository —— 平台設定的持久化契約。
 *
 * 例：分潤比例、地址揭露時間、對帳閾值、關帳日。
 * 設定值可以是任何 JSON-safe 的物件。
 *
 * 實作：CloudDBSystemConfigRepository（正式）、InMemorySystemConfigRepository（測試）
 */
const SystemConfigRepository = Object.freeze({
  name: 'SystemConfigRepository',
  methods: Object.freeze(['get', 'set']),
  contract: Object.freeze({
    /**
     * 讀取設定。
     *
     * @param {string} key
     * @param {*} [defaultValue] 找不到時回傳這個值（預設 `null`）
     * @returns {Promise<*>}
     */
    get: '(key: string, defaultValue?: any): Promise<any>',

    /**
     * 寫入／覆蓋設定（upsert）。
     * @returns {Promise<void>}
     */
    set: '(key: string, value: any): Promise<void>',
  }),
});

module.exports = { SystemConfigRepository };
