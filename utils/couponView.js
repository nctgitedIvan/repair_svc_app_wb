/**
 * 優惠券的畫面規則 —— **純函式**。
 *
 * 為什麼不 import `packages/domain`：
 *   前端不得引用 packages/（docs/04 紅線 2）。因此這裡保留一份
 *   「有效期、門檻、封頂」的規則，與 `packages/domain/coupon/Coupon.js` 一致；
 *   `tests/unit/frontend/couponView.test.js` 會逐條對照。
 *
 * ⚠️ 這裡只做「能不能用、折多少」；發放與狀態流轉在後端。
 */

const STATUS = Object.freeze({
  UNUSED: 'unused',
  USED: 'used',
  EXPIRED: 'expired',
});

/** 不可用原因 → 畫面文字 */
const REASON_TEXT = Object.freeze({
  COUPON_MISSING: '優惠券不存在',
  COUPON_USED: '優惠券已使用',
  COUPON_EXPIRED: '優惠券已過期',
  COUPON_NOT_STARTED: '優惠券尚未生效',
  INVALID_COUPON: '優惠券資料不正確',
  BELOW_THRESHOLD: '未達使用門檻',
});

/** 金額（分）→ 顯示用的元；整數元不顯示 .00 */
function formatYuan(cents) {
  const value = Number(cents);
  if (!Number.isFinite(value)) return '0';
  return (value / 100).toFixed(2).replace(/\.00$/, '');
}

/**
 * 回傳不可用原因；可用時回 `null`。
 *
 * @param {object|null} coupon
 * @param {number} subtotalCents 折扣前的小計
 * @param {number} now epoch ms
 */
function unusableReason(coupon, subtotalCents, now) {
  if (!coupon) return 'COUPON_MISSING';

  const status = coupon.status || STATUS.UNUSED;
  if (status === STATUS.USED) return 'COUPON_USED';
  if (status === STATUS.EXPIRED) return 'COUPON_EXPIRED';

  const current = Number.isInteger(now) ? now : 0;
  if (Number.isInteger(coupon.validFrom) && current < coupon.validFrom) return 'COUPON_NOT_STARTED';
  if (Number.isInteger(coupon.validTo) && current > coupon.validTo) return 'COUPON_EXPIRED';

  if (!Number.isInteger(coupon.amountCents) || coupon.amountCents <= 0) return 'INVALID_COUPON';

  const minSpend = Number.isInteger(coupon.minSpendCents) ? coupon.minSpendCents : 0;
  const subtotal = Number.isInteger(subtotalCents) ? subtotalCents : 0;
  if (subtotal < minSpend) return 'BELOW_THRESHOLD';

  return null;
}

function isUsable(coupon, subtotalCents, now) {
  return unusableReason(coupon, subtotalCents, now) === null;
}

/** 可抵扣金額（整數分）；不可用時 0；不可超過小計 */
function discountFor(coupon, subtotalCents, now) {
  if (!isUsable(coupon, subtotalCents, now)) return 0;
  return Math.min(coupon.amountCents, subtotalCents);
}

/**
 * 加上畫面需要的顯示欄位。
 *
 * @param {object} coupon
 * @param {number} subtotalCents
 * @param {number} now
 * @param {(ms:number)=>string} [formatDate] 由頁面注入（dayjs），避免 util 依賴日期庫
 */
function decorate(coupon, subtotalCents, now, formatDate) {
  if (!coupon) return null;

  const reason = unusableReason(coupon, subtotalCents, now);
  const minSpend = Number.isInteger(coupon.minSpendCents) ? coupon.minSpendCents : 0;

  return {
    ...coupon,
    usable: reason === null,
    disabled: reason !== null,
    reason,
    reasonText: reason ? REASON_TEXT[reason] || '優惠券不可用' : '',
    amountText: formatYuan(coupon.amountCents),
    thresholdText: minSpend > 0 ? `滿 ${formatYuan(minSpend)} 可用` : '無門檻',
    validText:
      typeof formatDate === 'function'
        ? `${formatDate(coupon.validFrom)} - ${formatDate(coupon.validTo)}`
        : '',
  };
}

/** 一次裝飾整份清單；可用的排前面，其餘依原順序 */
function decorateList(coupons, subtotalCents, now, formatDate) {
  const rows = (coupons || []).map((coupon) => decorate(coupon, subtotalCents, now, formatDate));
  return rows.sort((a, b) => Number(b.usable) - Number(a.usable));
}

module.exports = {
  STATUS,
  REASON_TEXT,
  formatYuan,
  unusableReason,
  isUsable,
  discountFor,
  decorate,
  decorateList,
};
