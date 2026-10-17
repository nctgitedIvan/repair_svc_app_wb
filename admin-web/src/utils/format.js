export const STATUS_COLORS = {
  PENDING_PAYMENT: 'gold',
  PAID_PENDING_ASSIGN: 'orange',
  ASSIGNED_PENDING_ACCEPT: 'blue',
  ACCEPTED_PENDING_VISIT: 'cyan',
  IN_SERVICE: 'processing',
  PENDING_ACCEPTANCE: 'purple',
  COMPLETED: 'green',
  DISPUTED: 'red',
  CANCELED_UNPAID: 'default',
  CANCELED_PAID_REFUNDED: 'default',
  VOIDED: 'default',
};

export function formatMoney(cents) {
  const value = Number.isInteger(cents) ? cents : 0;
  return `¥${(value / 100).toFixed(2)}`;
}

export function yuanToCents(value) {
  const yuan = Number(value);
  if (!Number.isFinite(yuan) || yuan < 0) return 0;
  return Math.round(yuan * 100);
}

export function centsToYuan(cents) {
  return (Number(cents || 0) / 100).toFixed(2);
}
