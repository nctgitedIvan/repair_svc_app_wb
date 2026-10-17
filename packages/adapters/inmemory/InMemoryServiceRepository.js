'use strict';

/** InMemoryServiceRepository —— ServiceRepository 的測試替身。 */
class InMemoryServiceRepository {
  #services = new Map();

  async findById(serviceId) {
    assertId(serviceId, 'serviceId');
    const service = this.#services.get(serviceId);
    return service ? clone(service) : null;
  }

  async listActive() {
    return [...this.#services.values()]
      .filter((service) => service.isActive !== false)
      .map(clone)
      .sort(byOrderThenName);
  }

  async save(service) {
    if (!service || typeof service !== 'object') {
      throw new TypeError('Service.save(service) 需要物件');
    }
    assertId(service.serviceId, 'serviceId');
    assertName(service.name);

    this.#services.set(service.serviceId, {
      serviceId: service.serviceId,
      name: service.name,
      nameEn: service.nameEn || '',
      description: service.description || '',
      detailHtml: service.detailHtml || '',
      images: Array.isArray(service.images) ? clone(service.images) : [],
      category: service.category || '',
      categoryId: service.categoryId || '',
      order: Number.isInteger(service.order) ? service.order : 0,
      priceCents: Number.isInteger(service.priceCents) ? service.priceCents : 0,
      durationMinutes: Number.isInteger(service.durationMinutes) ? service.durationMinutes : 0,
      skillTags: Array.isArray(service.skillTags) ? clone(service.skillTags) : [],
      isActive: service.isActive !== false,
    });
  }

  size() {
    return this.#services.size;
  }
}

function byOrderThenName(a, b) {
  const diff = (a.order ?? 0) - (b.order ?? 0);
  return diff !== 0 ? diff : String(a.name).localeCompare(String(b.name));
}

function assertId(value, name) {
  if (typeof value !== 'string' || value.length === 0) {
    throw new TypeError(`${name} 必須是非空字串`);
  }
}

function assertName(value) {
  if (typeof value !== 'string' || value.length === 0) {
    throw new TypeError('Service.name 必須是非空字串');
  }
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

module.exports = { InMemoryServiceRepository };
