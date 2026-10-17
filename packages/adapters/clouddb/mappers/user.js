'use strict';

/** users 集合的 row → UserRecord 映射。 */

function fromRow(row) {
  if (!row) return null;
  const budget = row.daily_refund_budget;
  return {
    id: row._id,
    openid: row.openid || '',
    roleType: row.role_type || 'customer',
    status: row.status || 'active',
    technicianId: row.technician_id || null,
    regions: Array.isArray(row.regions) ? row.regions.slice() : [],
    dailyRefundBudget: budget
      ? {
          date: budget.date || null,
          usedCents: Number.isInteger(budget.used_cents) ? budget.used_cents : 0,
          limitCents: Number.isInteger(budget.limit_cents) ? budget.limit_cents : 0,
        }
      : null,
    nickname: row.nickname || '',
    phone: row.phone || '',
    lastLoginAt: Number.isInteger(row.last_login_at) ? row.last_login_at : null,
  };
}

module.exports = { fromRow };
