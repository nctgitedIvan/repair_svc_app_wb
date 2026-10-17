'use strict';

const { fromRow } = require('./mappers/user');

/** CloudDBUserRepository —— `users` 的雲端實作（只寫不跑）。 */
function createCloudDBUserRepository({ client } = {}) {
  if (!client || typeof client.collection !== 'function') {
    throw new TypeError('CloudDBUserRepository 需要 CloudDBClient');
  }

  const collection = () => client.collection('users');

  return {
    /** 測試輔助（不在 Port 契約內）：直接寫入使用者文件 */
    async seed(users = []) {
      for (const user of users) {
        assertString(user.id, 'user.id');
        assertString(user.openid, 'user.openid');
        await collection()
          .doc(user.id)
          .set({
            data: {
              openid: user.openid,
              role_type: user.roleType || 'customer',
              status: user.status || 'active',
              technician_id: user.technicianId || null,
              regions: Array.isArray(user.regions) ? user.regions : [],
              daily_refund_budget: user.dailyRefundBudget
                ? {
                    date: user.dailyRefundBudget.date || null,
                    used_cents: user.dailyRefundBudget.usedCents || 0,
                    limit_cents: user.dailyRefundBudget.limitCents || 0,
                  }
                : null,
              nickname: user.nickname || '',
              phone: user.phone || '',
              last_login_at: user.lastLoginAt || null,
            },
          });
      }
    },

    async findByOpenid(openid) {
      assertString(openid, 'openid');
      const result = await collection().where({ openid }).limit(1).get();
      const row = result && Array.isArray(result.data) ? result.data[0] : null;
      return row ? fromRow(row) : null;
    },

    async findById(userId) {
      assertString(userId, 'userId');
      try {
        const snapshot = await collection().doc(userId).get();
        return snapshot && snapshot.data ? fromRow({ ...snapshot.data, _id: userId }) : null;
      } catch (err) {
        if (isNotFound(err)) return null;
        throw err;
      }
    },

    async updateLastLogin(userId, atMillis) {
      assertString(userId, 'userId');
      if (!Number.isInteger(atMillis)) throw new TypeError('atMillis 必須是整數');
      try {
        await collection().doc(userId).update({ data: { last_login_at: atMillis } });
      } catch (err) {
        // 登入流程不應因更新失敗而中斷
        if (!isNotFound(err)) throw err;
      }
    },
  };
}

function assertString(value, name) {
  if (typeof value !== 'string' || value.length === 0) {
    throw new TypeError(`${name} 必須是非空字串`);
  }
}

function isNotFound(err) {
  const text = `${(err && err.errCode) || ''} ${(err && err.code) || ''} ${
    (err && err.message) || ''
  }`.toLowerCase();
  return text.includes('not exist') || text.includes('not found') || text.includes('does not exist');
}

module.exports = { createCloudDBUserRepository };
