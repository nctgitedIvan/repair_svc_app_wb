'use strict';

/** carts 集合的 row ↔ CartRecord 映射（doc `_id` = userId）。 */

function itemToRow(item) {
  return {
    line_id: item.lineId,
    product_id: item.productId,
    sku_id: item.skuId || null,
    quantity: Number.isInteger(item.quantity) ? item.quantity : 0,
    added_price_cents: Number.isInteger(item.addedPriceCents) ? item.addedPriceCents : 0,
    currency: item.currency || 'CNY',
    added_at: Number.isInteger(item.addedAt) ? item.addedAt : null,
  };
}

function itemFromRow(row) {
  return {
    lineId: row.line_id,
    productId: row.product_id,
    skuId: row.sku_id || null,
    quantity: Number.isInteger(row.quantity) ? row.quantity : 0,
    addedPriceCents: Number.isInteger(row.added_price_cents) ? row.added_price_cents : 0,
    currency: row.currency || 'CNY',
    addedAt: Number.isInteger(row.added_at) ? row.added_at : null,
  };
}

function toRow(cart) {
  return {
    items: Array.isArray(cart.items) ? cart.items.map(itemToRow) : [],
    updated_at: Number.isInteger(cart.updatedAt) ? cart.updatedAt : null,
  };
}

function fromRow(row, userId) {
  if (!row) return null;
  return {
    userId,
    items: Array.isArray(row.items) ? row.items.map(itemFromRow) : [],
    updatedAt: Number.isInteger(row.updated_at) ? row.updated_at : null,
  };
}

module.exports = { toRow, fromRow };
