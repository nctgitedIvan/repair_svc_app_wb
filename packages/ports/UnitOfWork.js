'use strict';

/**
 * UnitOfWork —— 交易邊界。
 *
 * 一個 Use Case 的多次寫入必須是原子的。
 * 實作由 adapter 決定（雲開發的 db.startTransaction、或測試用的記憶體交易）。
 *
 * ⚠️ **需人工核對**：微信雲開發資料庫交易的限制（單一事務可操作的集合數、
 * 是否支援跨集合、逾時時間）尚未查閱官方文檔，於 P2 實作前必須確認。
 *
 * 實作：CloudDBUnitOfWork（正式）、InMemoryUnitOfWork（測試）
 */
const UnitOfWork = Object.freeze({
  name: 'UnitOfWork',
  methods: Object.freeze(['run']),
  contract: Object.freeze({
    /**
     * 在交易中執行 fn。fn 拋出例外 → 全部回滾。
     *
     * @param {(tx: UnitOfWorkTransaction) => Promise<any>} fn
     * @returns {Promise<any>} fn 的回傳值
     */
    run: '(fn: (tx: UnitOfWorkTransaction) => Promise<any>): Promise<any>',
  }),
});

const UnitOfWorkTransaction = Object.freeze({
  name: 'UnitOfWorkTransaction',
  methods: Object.freeze(['onCommit']),
  contract: Object.freeze({
    /**
     * 註冊「交易成功後才執行」的副作用（例如發送通知）。
     * 絕不可在交易中使用：交易可能回滾，但已送出的通知無法收回。
     */
    onCommit: '(callback: () => void | Promise<void>): void',
  }),
});

module.exports = { UnitOfWork, UnitOfWorkTransaction };
