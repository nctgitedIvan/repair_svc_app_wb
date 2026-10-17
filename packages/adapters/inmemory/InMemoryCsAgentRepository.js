'use strict';

/**
 * InMemoryCsAgentRepository —— CsAgentRepository 的測試替身。
 */
class InMemoryCsAgentRepository {
  #agents = new Map();

  async findById(csAgentId) {
    assertId(csAgentId);
    const agent = this.#agents.get(csAgentId);
    return agent ? clone(agent) : null;
  }

  async findByUserId(userId) {
    assertId(userId);
    for (const agent of this.#agents.values()) {
      if (agent.userId === userId) return clone(agent);
    }
    return null;
  }

  async save(csAgent) {
    if (!csAgent || typeof csAgent !== 'object') {
      throw new TypeError('CsAgent.save(csAgent) 需要物件');
    }
    assertId(csAgent.csAgentId);
    assertId(csAgent.userId);

    this.#agents.set(csAgent.csAgentId, {
      csAgentId: csAgent.csAgentId,
      userId: csAgent.userId,
      employeeNo: csAgent.employeeNo || '',
      name: csAgent.name || '',
      regions: Array.isArray(csAgent.regions) ? clone(csAgent.regions) : [],
      status: csAgent.status || 'active',
      dailyRefundBudget: normalizeBudget(csAgent.dailyRefundBudget),
    });
  }

  async incrementDailyRefundUsage({ csAgentId, date, amountCents } = {}) {
    assertId(csAgentId);
    assertDate(date);
    if (!Number.isInteger(amountCents) || amountCents < 0) {
      throw new TypeError('amountCents 必須是非負整數');
    }

    const agent = this.#agents.get(csAgentId);
    if (!agent) throw new Error(`CsAgent 不存在：${csAgentId}`);

    const current = normalizeBudget(agent.dailyRefundBudget);
    const budget =
      current.date === date
        ? { ...current, usedCents: current.usedCents + amountCents }
        : { ...current, date, usedCents: amountCents };

    agent.dailyRefundBudget = budget;
    return clone(budget);
  }

  size() {
    return this.#agents.size;
  }
}

function normalizeBudget(budget) {
  if (!budget || typeof budget !== 'object') {
    return { date: null, usedCents: 0, limitCents: 0 };
  }
  return {
    date: typeof budget.date === 'string' ? budget.date : null,
    usedCents: Number.isInteger(budget.usedCents) ? budget.usedCents : 0,
    limitCents: Number.isInteger(budget.limitCents) ? budget.limitCents : 0,
  };
}

function assertId(value) {
  if (typeof value !== 'string' || value.length === 0) {
    throw new TypeError('CsAgent 識別碼必須是非空字串');
  }
}

function assertDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new TypeError('date 必須是 YYYY-MM-DD');
  }
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

module.exports = { InMemoryCsAgentRepository };
