'use strict';

/**
 * LoggerPort —— 結構化日誌。
 *
 * 為什麼 domain 不能用 console：見 docs/01-目標架構.md §1.6.1。
 * 日誌一律由 adapter 決定輸出目的地（雲函數日誌 / 檔案 / 記憶體）。
 *
 * 注意：**稽核軌跡不走這裡**。稽核走 AuditLogRepository 寫入資料庫，
 * 因為稽核是「事實來源」，日誌只是「除錯輔助」。
 */
const LoggerPort = Object.freeze({
  name: 'LoggerPort',
  methods: Object.freeze(['debug', 'info', 'warn', 'error']),
  contract: Object.freeze({
    debug: '(message: string, meta?: object): void',
    info: '(message: string, meta?: object): void',
    warn: '(message: string, meta?: object): void',
    error: '(message: string, error?: Error, meta?: object): void',
  }),
});

module.exports = { LoggerPort };
