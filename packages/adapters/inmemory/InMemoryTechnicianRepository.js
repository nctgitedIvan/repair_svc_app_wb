'use strict';

/**
 * InMemoryTechnicianRepository —— TechnicianRepository 的測試替身。
 */
class InMemoryTechnicianRepository {
  #technicians = new Map();

  async findById(technicianId) {
    assertId(technicianId);
    const technician = this.#technicians.get(technicianId);
    return technician ? clone(technician) : null;
  }

  async findByUserId(userId) {
    assertId(userId);
    for (const technician of this.#technicians.values()) {
      if (technician.userId === userId) return clone(technician);
    }
    return null;
  }

  async save(technician) {
    if (!technician || typeof technician !== 'object') {
      throw new TypeError('Technician.save(technician) 需要物件');
    }
    assertId(technician.technicianId);
    assertId(technician.userId);

    this.#technicians.set(technician.technicianId, {
      merchantId: technician.merchantId || 'platform',
      technicianId: technician.technicianId,
      userId: technician.userId,
      name: technician.name || '',
      phone: technician.phone || '',
      status: technician.status || 'pending',
      skillTags: Array.isArray(technician.skillTags) ? clone(technician.skillTags) : [],
      level: technician.level || null,
      approvedAt: Number.isInteger(technician.approvedAt) ? technician.approvedAt : null,
    });
  }

  async listByStatus(status) {
    if (typeof status !== 'string' || status.length === 0) {
      throw new TypeError('status 必須是非空字串');
    }
    return [...this.#technicians.values()]
      .filter((technician) => technician.status === status)
      .map(clone)
      .sort((a, b) => String(a.name).localeCompare(String(b.name)));
  }

  size() {
    return this.#technicians.size;
  }
}

function assertId(value) {
  if (typeof value !== 'string' || value.length === 0) {
    throw new TypeError('Technician 識別碼必須是非空字串');
  }
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

module.exports = { InMemoryTechnicianRepository };
