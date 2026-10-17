'use strict';

const { Result } = require('@repair/shared-kernel/Result');

/**
 * AuthenticateUseCase —— 第 1 層：身分驗證（P3）。
 *
 * **只回答「你是誰」，不回答「你能做什麼」。**
 * 角色能力由 domain 的 `AccessPolicy` 決定（第 2／3 層）。
 *
 * ⚠️ 本層**不得** import 任何微信 SDK。
 *    `openid` 由入口（雲函數 bootstrap）從 `getWXContext()` 取得後傳入。
 */
class AuthenticateUseCase {
  constructor({ userRepository, customerRepository }) {
    if (!userRepository) throw new TypeError('AuthenticateUseCase 需要 userRepository');
    this.userRepository = userRepository;
    this.customerRepository = customerRepository || null;
  }

  /**
   * @param {{ openid?: string }} params
   * @returns {Promise<Result>} actor 或 UNAUTHENTICATED／FORBIDDEN
   */
  async execute({ openid } = {}) {
    if (!openid || typeof openid !== 'string') {
      return Result.unauthenticated('無法取得身分識別');
    }

    const user = await this.userRepository.findByOpenid(openid);
    if (!user) {
      // 不區分「openid 不存在」與「使用者未註冊」，避免使用者列舉
      return Result.unauthenticated('無法取得身分識別');
    }
    if (user.status !== 'active') {
      return Result.forbidden('帳號已停用');
    }

    let customerId = null;
    if (user.roleType === 'customer' && this.customerRepository) {
      const customer = await this.customerRepository.findByUserId(user.id);
      customerId = customer ? customer.customerId : null;
    }

    return Result.ok({
      id: user.id,
      openid,
      role: user.roleType,
      customerId,
      technicianId: user.technicianId || null,
      regions: Array.isArray(user.regions) ? user.regions : [],
      dailyRefundBudget: user.dailyRefundBudget || null,
      // admin 的權限來自權限組（docs/01 §4.8.4）
      permissions: Array.isArray(user.permissions) ? user.permissions : [],
    });
  }
}

module.exports = { AuthenticateUseCase };
