'use strict';

/** products 集合的 row ↔ ProductRecord 映射。 */

function specToRow(spec) {
  return {
    spec_id: spec.specId,
    title: spec.title || '',
    values: Array.isArray(spec.values) ? spec.values.slice() : [],
  };
}

function specFromRow(row) {
  return {
    specId: row.spec_id,
    title: row.title || '',
    values: Array.isArray(row.values) ? row.values.slice() : [],
  };
}

function skuToRow(sku) {
  return {
    sku_id: sku.skuId,
    spec_values: Array.isArray(sku.specValues) ? sku.specValues.slice() : [],
    price_cents: Number.isInteger(sku.priceCents) ? sku.priceCents : 0,
    stock: Number.isInteger(sku.stock) ? sku.stock : 0,
    image: sku.image || '',
  };
}

function skuFromRow(row) {
  return {
    skuId: row.sku_id,
    specValues: Array.isArray(row.spec_values) ? row.spec_values.slice() : [],
    priceCents: Number.isInteger(row.price_cents) ? row.price_cents : 0,
    stock: Number.isInteger(row.stock) ? row.stock : 0,
    image: row.image || '',
  };
}

function toRow(product) {
  return {
    merchant_id: product.merchantId || 'platform',
    name: product.name,
    name_en: product.nameEn || '',
    description: product.description || '',
    detail_html: product.detailHtml || '',
    images: Array.isArray(product.images) ? product.images.slice() : [],
    category: product.category || '',
    category_id: product.categoryId || '',
    order: Number.isInteger(product.order) ? product.order : 0,
    price_cents: Number.isInteger(product.priceCents) ? product.priceCents : 0,
    stock: Number.isInteger(product.stock) ? product.stock : 0,
    specs: Array.isArray(product.specs) ? product.specs.map(specToRow) : [],
    skus: Array.isArray(product.skus) ? product.skus.map(skuToRow) : [],
    is_active: product.isActive !== false,
  };
}

function fromRow(row) {
  if (!row) return null;
  return {
    merchantId: row.merchant_id || 'platform',
    productId: row._id,
    name: row.name || '',
    nameEn: row.name_en || '',
    description: row.description || '',
    detailHtml: row.detail_html || '',
    images: Array.isArray(row.images) ? row.images.slice() : [],
    category: row.category || '',
    categoryId: row.category_id || '',
    order: Number.isInteger(row.order) ? row.order : 0,
    priceCents: Number.isInteger(row.price_cents) ? row.price_cents : 0,
    stock: Number.isInteger(row.stock) ? row.stock : 0,
    specs: Array.isArray(row.specs) ? row.specs.map(specFromRow) : [],
    skus: Array.isArray(row.skus) ? row.skus.map(skuFromRow) : [],
    isActive: row.is_active !== false,
  };
}

module.exports = { toRow, fromRow };
