'use strict';

/**
 * InMemoryUserRepository —— UserRepository 的測試替身。
 *
 * 讓 `authenticate` 能在不啟動雲環境的情況下被完整測試
 * （三種失敗：無 OPENID、查無使用者、帳號停用）。
 *
 * 契約見 packages/ports/UserRepository.js。
 * 零業務邏輯：不做權限判斷，只回傳事實。
 */
class InMemoryUserRepository {
  #usersByOpenid = new Map();

  /**
   * @param {Array<object>} users 符合 UserRecord 形狀的資料
   */
  seed(users = []) {
    for (const user of users) {
      if (!user.openid) throw new TypeError('seed 的每筆使用者都必須有 openid');
      this.#usersByOpenid.set(user.openid, {
        status: 'active',
        roleType: 'customer',
        technicianId: null,
        regions: [],
        dailyRefundBudget: null,
        ...user,
      });
    }
    return this;
  }

  async findByOpenid(openid) {
    const user = this.#usersByOpenid.get(openid);
    return user ? { ...user } : null;
  }

  async findById(userId) {
    for (const user of this.#usersByOpenid.values()) {
      if (user.id === userId) return { ...user };
    }
    return null;
  }

  async updateLastLogin(userId, atMillis) {
    for (const user of this.#usersByOpenid.values()) {
      if (user.id === userId) {
        user.lastLoginAt = atMillis; // 測試替身不做持久化，僅記錄
        return;
      }
    }
  }

  /** 測試輔助 */
  size() {
    return this.#usersByOpenid.size;
  }
}

module.exports = { InMemoryUserRepository };
