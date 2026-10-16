'use strict';

const { MaskedPhone } = require('../../shared/MaskedPhone');

/**
 * ContactMaskingPolicy —— 聯絡方式脫敏。
 *
 * | 檢視者 | 結果 |
 * |---|---|
 * | 客服／管理員 | `FULL`（完整號碼） |
 * | 客戶本人 | `FULL`（自己的號碼） |
 * | **師傅** | 🔴 **一律 `MASKED`，無例外** |
 * | 其他 | `MASKED` |
 *
 * **師傅沒有任何解鎖條件** —— 不像地址有「服務當日 08:00」這種例外。
 * 師傅要聯絡客戶一律走 `ContactChannelPolicy` 的通道（客服三方通話／虛擬號）。
 *
 * 對應 docs/01 §3.4、A2、Q12。
 */

const DisclosureLevel = Object.freeze({
  /** 完整號碼 */
  FULL: 'FULL',
  /** 遮罩後（`MaskedPhone`） */
  MASKED: 'MASKED',
});

/**
 * @param {object} params
 * @param {{ id: string, role: string }} params.viewer
 * @param {{ userId?: string, phone: string }} params.customer
 * @returns {{ level: string, phone: string|MaskedPhone }}
 */
function maskFor({ viewer, customer }) {
  if (!customer || !customer.phone) {
    return { level: DisclosureLevel.MASKED, phone: null };
  }

  if (viewer) {
    if (viewer.role === 'cs_agent' || viewer.role === 'admin') {
      return { level: DisclosureLevel.FULL, phone: customer.phone };
    }
    if (viewer.role === 'customer' && viewer.id === customer.userId) {
      return { level: DisclosureLevel.FULL, phone: customer.phone };
    }
  }

  // ⚠️ 師傅與其他所有情況 → 遮罩。沒有例外路徑。
  return { level: DisclosureLevel.MASKED, phone: MaskedPhone.of(customer.phone) };
}

/** 便利方法：一律回傳遮罩版本（師傅端 DTO 組裝用） */
function maskAlways(phone) {
  return MaskedPhone.of(phone);
}

module.exports = { maskFor, maskAlways, DisclosureLevel };
