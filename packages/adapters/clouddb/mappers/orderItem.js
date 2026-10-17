'use strict';

/** order_items 集合的 row ↔ OrderItem.toJSON() 映射。 */

function toRow(item, orderId, index) {
  return {
    order_id: orderId,
    item_index: index,
    item_type: item.itemType,
    item_ref_id: item.itemRefId,
    name_snapshot: item.nameSnapshot,
    spec_snapshot: item.specSnapshot || '',
    unit_price_cents: item.unitPriceCents,
    currency: item.currency,
    quantity: item.quantity,
    fee_type: item.feeType,
    commission_rate_bp_snapshot: item.commissionRateBpSnapshot,
  };
}

function fromRow(row) {
  return {
    itemType: row.item_type,
    itemRefId: row.item_ref_id,
    nameSnapshot: row.name_snapshot,
    specSnapshot: row.spec_snapshot || '',
    unitPriceCents: row.unit_price_cents,
    currency: row.currency,
    quantity: row.quantity,
    feeType: row.fee_type,
    commissionRateBpSnapshot: row.commission_rate_bp_snapshot,
  };
}

module.exports = { toRow, fromRow };
