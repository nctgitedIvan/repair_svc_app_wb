'use strict';

/**
 * InMemoryLoggerAdapter —— 測試用的日誌收集器。
 *
 * 讓測試能斷言「有沒有記錄」，而不需要解析 console 輸出。
 */
class InMemoryLoggerAdapter {
  #entries = [];

  debug(message, meta) {
    this.#entries.push({ level: 'debug', message, meta });
  }

  info(message, meta) {
    this.#entries.push({ level: 'info', message, meta });
  }

  warn(message, meta) {
    this.#entries.push({ level: 'warn', message, meta });
  }

  error(message, err, meta) {
    this.#entries.push({ level: 'error', message, meta, error: err ? String(err) : null });
  }

  /** 測試輔助 */
  entries() {
    return [...this.#entries];
  }

  /** 測試輔助 */
  findByLevel(level) {
    return this.#entries.filter((e) => e.level === level);
  }
}

module.exports = { InMemoryLoggerAdapter };
