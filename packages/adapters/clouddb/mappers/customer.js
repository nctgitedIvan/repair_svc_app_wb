'use strict';

/** customers 集合的 row ↔ CustomerRecord 映射。 */

function addressToRow(address) {
  return {
    address_id: address.addressId,
    name: address.name || '',
    phone: address.phone || '',
    province: address.province || '',
    city: address.city || '',
    district: address.district || '',
    detail_address: address.detailAddress || '',
    is_default: address.isDefault === true,
  };
}

function addressFromRow(row) {
  return {
    addressId: row.address_id,
    name: row.name || '',
    phone: row.phone || '',
    province: row.province || '',
    city: row.city || '',
    district: row.district || '',
    detailAddress: row.detail_address || '',
    isDefault: row.is_default === true,
  };
}

function toRow(customer) {
  return {
    user_id: customer.userId,
    name: customer.name || '',
    phone: customer.phone || '',
    addresses: Array.isArray(customer.addresses) ? customer.addresses.map(addressToRow) : [],
    default_address_id: customer.defaultAddressId || null,
    created_at: Number.isInteger(customer.createdAt) ? customer.createdAt : null,
    updated_at: Number.isInteger(customer.updatedAt) ? customer.updatedAt : null,
  };
}

function fromRow(row) {
  if (!row) return null;
  return {
    customerId: row._id,
    userId: row.user_id,
    name: row.name || '',
    phone: row.phone || '',
    addresses: Array.isArray(row.addresses) ? row.addresses.map(addressFromRow) : [],
    defaultAddressId: row.default_address_id || null,
    createdAt: Number.isInteger(row.created_at) ? row.created_at : null,
    updatedAt: Number.isInteger(row.updated_at) ? row.updated_at : null,
  };
}

module.exports = { toRow, fromRow };
