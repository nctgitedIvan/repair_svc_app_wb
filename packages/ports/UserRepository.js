'use strict';

/**
 * UserRepository —— 使用者與角色的持久化契約。
 *
 * 只描述契約，實作放 packages/adapters（CloudDB / InMemory）。
 *
 * 注意：本 Port **不做權限判斷**。它只回傳事實（這個 openid 是誰、什麼角色），
 * 「這個角色能不能做這件事」是 domain 的 AccessPolicy 職責（docs/01 §4.7）。
 *
 * 實作：CloudDBUserRepository（P3）、InMemoryUserRepository（測試）
 */
const UserRepository = Object.freeze({
  name: 'UserRepository',
  methods: Object.freeze(['findByOpenid', 'findById', 'updateLastLogin']),

  /**
   * User 讀取模型（非聚合——身分不需要不變式保護）。
   *
   * @typedef {object} UserRecord
   * @property {string}  id
   * @property {string}  openid
   * @property {'customer'|'cs_agent'|'technician'|'admin'} roleType
   * @property {'active'|'disabled'|'pending'} status
   * @property {string|null} technicianId        師傅專屬，供所有權約束使用
   * @property {string[]}    regions             客服專屬，供區域約束使用
   * @property {object|null} dailyRefundBudget   { date, usedCents, limitCents }，供金額約束使用
   */

  contract: Object.freeze({
    /** @returns {Promise<UserRecord|null>} */
    findByOpenid: '(openid: string): Promise<UserRecord|null>',

    /** @returns {Promise<UserRecord|null>} */
    findById: '(userId: string): Promise<UserRecord|null>',

    /** 登入時更新；失敗不應阻斷登入流程 */
    updateLastLogin: '(userId: string, atMillis: number): Promise<void>',
  }),
});

module.exports = { UserRepository };
