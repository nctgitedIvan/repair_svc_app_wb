'use strict';

const { toRow, fromRow, budgetToRow, budgetFromRow } = require('./mappers/csAgent');

/** CloudDBCsAgentRepository —— `cs_agents` 的雲端實作（只寫不跑）。 */
function createCloudDBCsAgentRepository({ client, uow } = {}) {
  if (!client || typeof client.collection !== 'function') {
    throw new TypeError('CloudDBCsAgentRepository 需要 CloudDBClient');
  }
  if (!uow || typeof uow.run !== 'function') {
    throw new TypeError('CloudDBCsAgentRepository 需要 UnitOfWork');
  }

  const collection = () => client.collection('cs_agents');

  return {
    async findById(csAgentId) {
      assertString(csAgentId, 'csAgentId');
      try {
        const snapshot = await collection().doc(csAgentId).get();
        return snapshot && snapshot.data ? fromRow({ ...snapshot.data, _id: csAgentId }) : null;
      } catch (err) {
        if (isNotFound(err)) return null;
        throw err;
      }
    },

    async findByUserId(userId) {
      assertString(userId, 'userId');
      const result = await collection().where({ user_id: userId }).limit(1).get();
      const row = result && Array.isArray(result.data) ? result.data[0] : null;
      return row ? fromRow(row) : null;
    },

    async save(csAgent) {
      if (!csAgent || typeof csAgent !== 'object') {
        throw new TypeError('CsAgent.save(csAgent) 需要物件');
      }
      assertString(csAgent.csAgentId, 'csAgentId');
      assertString(csAgent.userId, 'userId');
      await collection().doc(csAgent.csAgentId).set({ data: toRow(csAgent) });
    },

    async incrementDailyRefundUsage({ csAgentId, date, amountCents } = {}) {
      assertString(csAgentId, 'csAgentId');
      if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        throw new TypeError('date 必須是 YYYY-MM-DD');
      }
      if (!Number.isInteger(amountCents) || amountCents < 0) {
        throw new TypeError('amountCents 必須是非負整數');
      }

      return uow.run(async (tx) => {
        const ref = tx.collection('cs_agents').doc(csAgentId);
        const snapshot = await ref.get();
        if (!snapshot || !snapshot.data) throw new Error(`CsAgent 不存在：${csAgentId}`);

        const current = budgetFromRow(snapshot.data.daily_refund_budget);
        const next =
          current.date === date
            ? { ...current, usedCents: current.usedCents + amountCents }
            : { ...current, date, usedCents: amountCents };

        await ref.update({ data: { daily_refund_budget: budgetToRow(next) } });
        return next;
      });
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

module.exports = { createCloudDBCsAgentRepository };
