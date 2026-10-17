'use strict';

/** favorites 集合的 row ↔ FavoriteRecord 映射（doc `_id` = customerId:productId）。 */

function snapshotToRow(snapshot) {
  if (!snapshot) return { name: '', image: '', price_cents: 0 };
  return {
    name: snapshot.name || '',
    image: snapshot.image || '',
    price_cents: Number.isInteger(snapshot.priceCents) ? snapshot.priceCents : 0,
  };
}

function snapshotFromRow(row) {
  if (!row) return { name: '', image: '', priceCents: 0 };
  return {
    name: row.name || '',
    image: row.image || '',
    priceCents: Number.isInteger(row.price_cents) ? row.price_cents : 0,
  };
}

function toRow(favorite) {
  return {
    customer_id: favorite.customerId,
    product_id: favorite.productId,
    product_snapshot: snapshotToRow(favorite.productSnapshot),
    created_at: Number.isInteger(favorite.createdAt) ? favorite.createdAt : null,
  };
}

function fromRow(row) {
  if (!row) return null;
  return {
    customerId: row.customer_id,
    productId: row.product_id,
    productSnapshot: snapshotFromRow(row.product_snapshot),
    createdAt: Number.isInteger(row.created_at) ? row.created_at : null,
  };
}

module.exports = { toRow, fromRow };
