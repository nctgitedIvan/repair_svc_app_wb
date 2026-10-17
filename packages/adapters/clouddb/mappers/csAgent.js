'use strict';

/** cs_agents 集合的 row ↔ CsAgentRecord 映射。 */

function budgetToRow(budget) {
  if (!budget) return { date: null, used_cents: 0, limit_cents: 0 };
  return {
    date: budget.date || null,
    used_cents: Number.isInteger(budget.usedCents) ? budget.usedCents : 0,
    limit_cents: Number.isInteger(budget.limitCents) ? budget.limitCents : 0,
  };
}

function budgetFromRow(row) {
  if (!row) return { date: null, usedCents: 0, limitCents: 0 };
  return {
    date: row.date || null,
    usedCents: Number.isInteger(row.used_cents) ? row.used_cents : 0,
    limitCents: Number.isInteger(row.limit_cents) ? row.limit_cents : 0,
  };
}

function toRow(agent) {
  return {
    user_id: agent.userId,
    employee_no: agent.employeeNo || '',
    name: agent.name || '',
    regions: Array.isArray(agent.regions) ? agent.regions.slice() : [],
    status: agent.status || 'active',
    daily_refund_budget: budgetToRow(agent.dailyRefundBudget),
  };
}

function fromRow(row) {
  if (!row) return null;
  return {
    csAgentId: row._id,
    userId: row.user_id,
    employeeNo: row.employee_no || '',
    name: row.name || '',
    regions: Array.isArray(row.regions) ? row.regions.slice() : [],
    status: row.status || 'active',
    dailyRefundBudget: budgetFromRow(row.daily_refund_budget),
  };
}

module.exports = { toRow, fromRow, budgetToRow, budgetFromRow };
