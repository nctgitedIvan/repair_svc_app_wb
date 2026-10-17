'use strict';

/** technicians 集合的 row ↔ TechnicianRecord 映射。 */

function toRow(technician) {
  return {
    merchant_id: technician.merchantId || 'platform',
    user_id: technician.userId,
    name: technician.name || '',
    phone: technician.phone || '',
    status: technician.status || 'pending',
    skill_tags: Array.isArray(technician.skillTags) ? technician.skillTags.slice() : [],
    level: technician.level || null,
    approved_at: Number.isInteger(technician.approvedAt) ? technician.approvedAt : null,
  };
}

function fromRow(row) {
  if (!row) return null;
  return {
    merchantId: row.merchant_id || 'platform',
    technicianId: row._id,
    userId: row.user_id,
    name: row.name || '',
    phone: row.phone || '',
    status: row.status || 'pending',
    skillTags: Array.isArray(row.skill_tags) ? row.skill_tags.slice() : [],
    level: row.level || null,
    approvedAt: Number.isInteger(row.approved_at) ? row.approved_at : null,
  };
}

module.exports = { toRow, fromRow };
