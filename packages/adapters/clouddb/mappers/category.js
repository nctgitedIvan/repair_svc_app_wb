'use strict';

/**
 * categories 集合的 row ↔ CategoryRecord 映射。
 *
 * DB 用 snake_case，doc `_id` 就是 categoryId。
 */

function toRow(category) {
  return {
    name: category.name,
    parent_id: category.parentId || null,
    icon: typeof category.icon === 'string' ? category.icon : '',
    order: Number.isInteger(category.order) ? category.order : 0,
    is_active: category.isActive !== false,
  };
}

function fromRow(row) {
  if (!row) return null;
  return {
    categoryId: row._id || row.category_id || '',
    name: row.name || '',
    parentId: row.parent_id || null,
    icon: row.icon || '',
    order: Number.isInteger(row.order) ? row.order : 0,
    isActive: row.is_active !== false,
  };
}

module.exports = { toRow, fromRow };
