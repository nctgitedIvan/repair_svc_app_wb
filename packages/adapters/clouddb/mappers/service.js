'use strict';

/** services 集合的 row ↔ ServiceRecord 映射。 */

function toRow(service) {
  return {
    name: service.name,
    name_en: service.nameEn || '',
    description: service.description || '',
    detail_html: service.detailHtml || '',
    images: Array.isArray(service.images) ? service.images.slice() : [],
    category: service.category || '',
    category_id: service.categoryId || '',
    order: Number.isInteger(service.order) ? service.order : 0,
    price_cents: Number.isInteger(service.priceCents) ? service.priceCents : 0,
    duration_minutes: Number.isInteger(service.durationMinutes) ? service.durationMinutes : 0,
    skill_tags: Array.isArray(service.skillTags) ? service.skillTags.slice() : [],
    is_active: service.isActive !== false,
  };
}

function fromRow(row) {
  if (!row) return null;
  return {
    serviceId: row._id,
    name: row.name || '',
    nameEn: row.name_en || '',
    description: row.description || '',
    detailHtml: row.detail_html || '',
    images: Array.isArray(row.images) ? row.images.slice() : [],
    category: row.category || '',
    categoryId: row.category_id || '',
    order: Number.isInteger(row.order) ? row.order : 0,
    priceCents: Number.isInteger(row.price_cents) ? row.price_cents : 0,
    durationMinutes: Number.isInteger(row.duration_minutes) ? row.duration_minutes : 0,
    skillTags: Array.isArray(row.skill_tags) ? row.skill_tags.slice() : [],
    isActive: row.is_active !== false,
  };
}

module.exports = { toRow, fromRow };
