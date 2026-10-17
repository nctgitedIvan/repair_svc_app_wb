'use strict';

/**
 * IdSequenceRepository —— 單號／序號器的持久化契約。
 *
 * 用途：訂單號、對外交易號、稽核鏈 seq 等需要**單調遞增**的序號。
 * 契約保證：同一個 key 的 `next()` 不會回傳重複值；併發呼叫也一樣。
 *
 * 實作：CloudDBIdSequenceRepository（正式）、InMemoryIdSequenceRepository（測試）
 */
const IdSequenceRepository = Object.freeze({
  name: 'IdSequenceRepository',
  methods: Object.freeze(['next']),
  contract: Object.freeze({
    /**
     * 取得下一個序號（從 1 開始）。
     *
     * ⚠️ 實作必須使用資料庫層的原子操作（`_.inc` 或事務），
     *    不得用「讀 → 加一 → 寫回」而沒有保護。
     *
     * @param {string} key 序號器名稱，例如 `order`、`audit:order:ord-1`
     * @returns {Promise<number>} 正整數
     */
    next: '(key: string): Promise<number>',
  }),
});

module.exports = { IdSequenceRepository };
