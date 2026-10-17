'use strict';

const { AddressView, DisclosureLevel } = require('../../shared/AddressView');

/**
 * AddressDisclosurePolicy —— 地址分級揭露。
 *
 * | 檢視者 | 揭露層級 |
 * |---|---|
 * | 客服／管理員 | **完整** |
 * | 客戶本人 | **完整** |
 * | **被指派的師傅** | 接單後＝**區域+街道**；**服務當日 08:00 起＝完整**；完工後 N 天自動降級 |
 * | 非指派師傅 | 區域+街道（**永遠**） |
 *
 * **純函式**：`now` 由呼叫方經 `ClockPort` 取得後以參數傳入。
 *
 * ⚠️ 時區：本政策以 `utcOffsetMinutes`（預設 480 = UTC+8）計算「服務當日 08:00」。
 *    刻意用**明確的參數**而非依賴執行環境的時區 —— 否則同一筆訂單在
 *    不同伺服器上會有不同的揭露時機。
 *
 * 對應 docs/01-目標架構.md §3.4、Q12。
 */

const DEFAULT_CONFIG = Object.freeze({
  /** 服務當日幾點揭露完整地址（當地時間） */
  discloseHour: 8,
  /** 完工後幾天自動降級回區域級 */
  revokeAfterDays: 7,
  /** 當地時區相對 UTC 的分鐘偏移（480 = UTC+8） */
  utcOffsetMinutes: 480,
});

const DAY_MS = 86_400_000;

/**
 * 計算「服務當日開始揭露」的 Unix 毫秒。
 *
 * 例：預約 2026-10-20 14:00（當地），08:00 揭露 → 2026-10-20 08:00 當地。
 */
function disclosureStartAt(appointmentAt, config = DEFAULT_CONFIG) {
  const { discloseHour, utcOffsetMinutes } = { ...DEFAULT_CONFIG, ...config };
  const local = appointmentAt + utcOffsetMinutes * 60_000;
  const localDayStart = Math.floor(local / DAY_MS) * DAY_MS;
  return localDayStart + discloseHour * 3_600_000 - utcOffsetMinutes * 60_000;
}

/**
 * @param {object} params
 * @param {{ id: string, role: string, technicianId?: string }} params.viewer
 * @param {object} params.order 需含 `address`（`Address` 或持久化形狀）與 `customerId`、`technicianId`
 * @param {number} params.now Unix 毫秒
 * @param {object} [params.config] 覆寫 DEFAULT_CONFIG（來自 system_configs）
 * @returns {AddressView}
 */
function discloseFor({ viewer, order, now, config = {} }) {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const address = order && order.address;

  if (!viewer || !address) {
    // 沒有足夠資訊 → 給最低層級（fail-safe：寧可少給，不可多給）
    return AddressView.district({ province: '', city: '', district: '', street: '' });
  }

  const full = () => toFull(address);
  const district = () => toDistrict(address);

  // ① 客服／管理員 → 完整
  if (viewer.role === 'cs_agent' || viewer.role === 'admin') return full();

  // ② 客戶本人 → 完整（actor.id 是 userId；actor.customerId 是 customers 的 id）
  if (viewer.role === 'customer' && (viewer.customerId || viewer.id) === order.customerId) {
    return full();
  }

  // ③ 師傅：必須是「被指派給自己」的訂單
  if (viewer.role !== 'technician' || !viewer.technicianId || order.technicianId !== viewer.technicianId) {
    return district();
  }

  // ④ 完工後 N 天 → 自動降級
  const completedAt = order.completedAt;
  if (Number.isInteger(completedAt) && Number.isInteger(now)) {
    if (now - completedAt > cfg.revokeAfterDays * DAY_MS) return district();
  }

  // ⑤ 服務當日 08:00 起 → 完整
  const appointmentAt = order.appointmentAt;
  if (Number.isInteger(appointmentAt) && Number.isInteger(now)) {
    if (now >= disclosureStartAt(appointmentAt, cfg)) return full();
  }

  // ⑥ 其餘（已派單／已接單但未到服務當日）→ 區域 + 街道
  return district();
}

function toFull(address) {
  return AddressView.full({
    province: address.province,
    city: address.city,
    district: address.district,
    street: address.street,
    detailAddress: address.detailAddress,
  });
}

function toDistrict(address) {
  return AddressView.district({
    province: address.province,
    city: address.city,
    district: address.district,
    street: address.street,
  });
}

module.exports = { discloseFor, disclosureStartAt, DEFAULT_CONFIG, DisclosureLevel };
