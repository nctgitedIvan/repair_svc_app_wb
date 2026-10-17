/**
 * 結算頁的畫面組裝 —— **純函式**。
 *
 * ## 為什麼要另開一支
 *
 * 結算頁要回答四件事，而這些規則不該散在頁面裡（頁面在 CI 裡跑不到）：
 *
 * 1. 這份 payload 是否符合 `docs/01` §3.8 的契約？
 * 2. 每一筆明細的**現價**、名稱、圖片、規格文字是什麼？
 * 3. 哪些明細已失效（商品／服務／SKU 不存在、缺 skuId）？
 * 4. 材料費、服務費、商品總額、合計各是多少？
 *
 * ## 金額的定義
 *
 * | 欄位 | 意義 |
 * |---|---|
 * | `materialTotalCents` | 商品（零件）明細合計 → **材料費** |
 * | `serviceTotalCents` | 服務明細合計 → **服務費** |
 * | `goodsTotalCents` | 兩者合計 → **商品總額** |
 * | `expectedTotalCents` | payload 帶進來的金額；與現價不同時 `priceChanged = true` |
 * | `totalCents` | 以現價算出的總額（提交時使用） |
 *
 * ⚠️ 失效的明細**不計入**任何金額，並由頁面阻擋提交。
 */

const { CHECKOUT_KEY } = require('./cart.js');
const { ItemType } = require('./catalogView.js');
const couponView = require('./couponView.js');

/** `docs/01` §3.8 的三種訂單型別 */
const ORDER_TYPE = Object.freeze({
  PRODUCT: 'product',
  SERVICE: 'service',
  MIXED: 'mixed',
});

/** 失效原因 → 畫面文字 */
const INVALID_REASON_TEXT = Object.freeze({
  PRODUCT_NOT_FOUND: '商品已不存在',
  SERVICE_NOT_FOUND: '服務已不存在',
  SKU_REQUIRED: '請選擇規格',
  SKU_NOT_FOUND: '規格已不存在',
  INVALID_QUANTITY: '數量不正確',
});

const VALID_ITEM_TYPES = [ItemType.PRODUCT, ItemType.SERVICE];

function isPositiveInteger(value) {
  return Number.isInteger(value) && value > 0;
}

/**
 * 由明細推導 `orderType`（不信任 payload 的欄位）。
 *
 * - 只有商品 → `product`
 * - 只有服務 → `service`
 * - 兩者都有 → `mixed`
 */
function orderTypeOf(items) {
  const list = Array.isArray(items) ? items.filter(Boolean) : [];
  const hasProduct = list.some((item) => item.itemType === ItemType.PRODUCT);
  const hasService = list.some((item) => item.itemType === ItemType.SERVICE);

  if (hasProduct && hasService) return ORDER_TYPE.MIXED;
  if (hasService) return ORDER_TYPE.SERVICE;
  return ORDER_TYPE.PRODUCT;
}

/**
 * 檢查 payload 是否符合 §3.8 契約。
 *
 * ⚠️ 這裡只檢查**形狀**；商品／服務是否存在、SKU 是否匹配由 `buildCheckoutView()` 判斷。
 *
 * @returns {{ ok: boolean, errors: string[] }}
 */
function validatePayload(payload) {
  const errors = [];

  if (!payload || typeof payload !== 'object') {
    return { ok: false, errors: ['INVALID_PAYLOAD'] };
  }
  if (!Object.values(ORDER_TYPE).includes(payload.orderType)) {
    errors.push('INVALID_ORDER_TYPE');
  }
  if (!Array.isArray(payload.items) || payload.items.length === 0) {
    errors.push('EMPTY_ITEMS');
    return { ok: false, errors };
  }
  if (!Number.isInteger(payload.expectedTotalCents) || payload.expectedTotalCents < 0) {
    errors.push('INVALID_EXPECTED_TOTAL');
  }

  payload.items.forEach((item) => {
    if (!item || typeof item !== 'object') {
      errors.push('INVALID_ITEM');
      return;
    }
    if (!VALID_ITEM_TYPES.includes(item.itemType)) errors.push('INVALID_ITEM_TYPE');
    if (typeof item.itemId !== 'string' || item.itemId.length === 0) {
      errors.push('INVALID_ITEM_ID');
    }
    if (!isPositiveInteger(item.quantity)) errors.push('INVALID_QUANTITY');
    // 服務不按件計價；契約規定 quantity 恆為 1
    if (item.itemType === ItemType.SERVICE && item.quantity !== 1) {
      errors.push('INVALID_SERVICE_QUANTITY');
    }
  });

  return { ok: errors.length === 0, errors };
}

/** 某個 SKU 的規格文字（例：`標準罐`；多維度用 ` / ` 分隔） */
function specTextOf(product, skuId) {
  if (!product || !Array.isArray(product.skus) || !skuId) return '';
  const sku = product.skus.find((entry) => entry.skuId === skuId);
  return sku && Array.isArray(sku.specValues) ? sku.specValues.join(' / ') : '';
}

/** 商品／服務清單 → id 索引 */
function indexById(list, idField) {
  const index = {};
  for (const item of list || []) {
    if (item && item[idField]) index[item[idField]] = item;
  }
  return index;
}

/** 一筆失效明細（仍保留顯示需要的欄位，讓使用者知道是哪一筆） */
function invalidLine({ item, name, image, reason }) {
  return {
    itemType: item.itemType,
    itemId: item.itemId,
    skuId: item.skuId || null,
    quantity: item.quantity,
    name: name || '',
    image: image || '',
    specText: '',
    unitPriceCents: 0,
    lineTotalCents: 0,
    invalid: true,
    reason,
    reasonText: INVALID_REASON_TEXT[reason] || '此明細已失效',
  };
}

/**
 * 把 payload ＋ 商品／服務現況組成結算頁的 view model。
 *
 * @param {{ payload: object, products?: Array, services?: Array,
 *           coupon?: object|null, now?: number }} args
 *        `coupon` 是已選的 UserCoupon＋Coupon 合併視圖（可為 null）；
 *        `now` 由頁面傳入，讓抵扣規則可被測試重現。
 * @returns {{
 *   ok: boolean, errors: string[], orderType: string,
 *   computedOrderType: string, orderTypeMismatch: boolean,
 *   lines: Array, invalidLines: Array,
 *   materialTotalCents: number, serviceTotalCents: number,
 *   goodsTotalCents: number, subtotalCents: number,
 *   discountCents: number, totalCents: number,
 *   coupon: object|null, couponInvalidReason: string|null,
 *   expectedTotalCents: number|null, priceChanged: boolean,
 *   hasService: boolean,
 * }}
 */
function buildCheckoutView({ payload, products, services, coupon = null, now = Date.now() } = {}) {
  const validation = validatePayload(payload);
  const emptyResult = {
    ok: false,
    errors: validation.errors,
    orderType: ORDER_TYPE.PRODUCT,
    computedOrderType: ORDER_TYPE.PRODUCT,
    orderTypeMismatch: false,
    lines: [],
    invalidLines: [],
    materialTotalCents: 0,
    serviceTotalCents: 0,
    goodsTotalCents: 0,
    subtotalCents: 0,
    discountCents: 0,
    totalCents: 0,
    coupon: null,
    couponInvalidReason: null,
    expectedTotalCents: null,
    priceChanged: false,
    hasService: false,
  };
  if (!validation.ok) return emptyResult;

  const productMap = indexById(products, 'productId');
  const serviceMap = indexById(services, 'serviceId');
  const items = payload.items;
  const lines = [];

  for (const item of items) {
    if (item.itemType === ItemType.SERVICE) {
      const service = serviceMap[item.itemId];
      if (!service) {
        lines.push(invalidLine({ item, reason: 'SERVICE_NOT_FOUND' }));
        continue;
      }
      const unitPriceCents = Number.isInteger(service.priceCents) ? service.priceCents : 0;
      const image = Array.isArray(service.images) && service.images.length > 0 ? service.images[0] : '';
      lines.push({
        itemType: ItemType.SERVICE,
        itemId: item.itemId,
        skuId: null,
        quantity: item.quantity,
        name: service.name || '',
        image,
        specText: '',
        unitPriceCents,
        lineTotalCents: unitPriceCents * item.quantity,
        invalid: false,
        reason: '',
        reasonText: '',
      });
      continue;
    }

    // 商品
    const product = productMap[item.itemId];
    if (!product) {
      lines.push(invalidLine({ item, reason: 'PRODUCT_NOT_FOUND' }));
      continue;
    }

    const hasSpecs = Array.isArray(product.specs) && product.specs.length > 0;
    const skus = Array.isArray(product.skus) ? product.skus : [];
    let unitPriceCents = Number.isInteger(product.priceCents) ? product.priceCents : 0;
    let image = Array.isArray(product.images) && product.images.length > 0 ? product.images[0] : '';
    let specText = '';

    if (hasSpecs) {
      if (!item.skuId) {
        lines.push(invalidLine({ item, name: product.name, image, reason: 'SKU_REQUIRED' }));
        continue;
      }
      const sku = skus.find((entry) => entry.skuId === item.skuId);
      if (!sku) {
        lines.push(invalidLine({ item, name: product.name, image, reason: 'SKU_NOT_FOUND' }));
        continue;
      }
      unitPriceCents = Number.isInteger(sku.priceCents) ? sku.priceCents : unitPriceCents;
      if (sku.image) image = sku.image;
      specText = Array.isArray(sku.specValues) ? sku.specValues.join(' / ') : '';
    }

    lines.push({
      itemType: ItemType.PRODUCT,
      itemId: item.itemId,
      skuId: item.skuId || null,
      quantity: item.quantity,
      name: product.name || '',
      image,
      specText,
      unitPriceCents,
      lineTotalCents: unitPriceCents * item.quantity,
      invalid: false,
      reason: '',
      reasonText: '',
    });
  }

  const validLines = lines.filter((line) => !line.invalid);
  const invalidLines = lines.filter((line) => line.invalid);
  const materialTotalCents = validLines
    .filter((line) => line.itemType === ItemType.PRODUCT)
    .reduce((sum, line) => sum + line.lineTotalCents, 0);
  const serviceTotalCents = validLines
    .filter((line) => line.itemType === ItemType.SERVICE)
    .reduce((sum, line) => sum + line.lineTotalCents, 0);
  const goodsTotalCents = materialTotalCents + serviceTotalCents;

  const computedOrderType = orderTypeOf(items);
  const expectedTotalCents = Number.isInteger(payload.expectedTotalCents)
    ? payload.expectedTotalCents
    : null;

  // ── 優惠券 ──
  // goodsTotalCents 是折扣前小計；抵扣不可超過它，總額不會變負數。
  const subtotalCents = goodsTotalCents;
  const couponInvalidReason = coupon ? couponView.unusableReason(coupon, subtotalCents, now) : null;
  const appliedCoupon = coupon && !couponInvalidReason ? coupon : null;
  const discountCents = appliedCoupon ? couponView.discountFor(appliedCoupon, subtotalCents, now) : 0;
  const totalCents = subtotalCents - discountCents;

  return {
    ok: invalidLines.length === 0,
    errors: validation.errors,
    orderType: computedOrderType,
    computedOrderType,
    orderTypeMismatch: payload.orderType !== computedOrderType,
    lines,
    invalidLines,
    materialTotalCents,
    serviceTotalCents,
    goodsTotalCents,
    subtotalCents,
    discountCents,
    totalCents,
    coupon: appliedCoupon,
    couponInvalidReason,
    expectedTotalCents,
    // expectedTotalCents 代表「使用者確認後應付的總額」；選券時頁面會同步更新它，
    // 因此這裡比較的是**折扣後**總額，而不是折扣前小計。
    priceChanged: expectedTotalCents !== null && expectedTotalCents !== totalCents,
    hasService: items.some((item) => item.itemType === ItemType.SERVICE),
  };
}

module.exports = {
  CHECKOUT_KEY,
  ORDER_TYPE,
  INVALID_REASON_TEXT,
  isPositiveInteger,
  orderTypeOf,
  validatePayload,
  specTextOf,
  buildCheckoutView,
};
