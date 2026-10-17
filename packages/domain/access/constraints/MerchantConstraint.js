'use strict';

const { Decision, Reason } = require('../Decision');

/**
 * MerchantConstraint —— 多租戶隔離（P3／T2）。
 *
 * 規則：**師傅只能看同一個 `merchantId` 的訂單**。
 * 其他角色（客戶／客服／管理員）的範圍由各自的權限矩陣決定，本約束放行。
 *
 * 為什麼要 fail-closed：
 *   若訂單或 actor 缺少 merchantId，預設為 `'platform'`；
 *   真正缺少 `order` 資源時一律拒絕，避免「不傳 order 就繞過」。
 *
 * ⚠️ 這是 ABAC 約束，必須註冊在 `Permission` 的 constraints 陣列中；
 *    只在 Use Case 裡寫 if 會漏掉其他入口。
 */
const DEFAULT_MERCHANT_ID = 'platform';

const MerchantConstraint = Object.freeze({
  name: 'MerchantConstraint',

  /**
   * @param {{ role?: string, merchantId?: string }} actor
   * @param {{ order?: object, orderRecord?: object }} resource
   */
  check(actor, resource = {}) {
    if (!actor || typeof actor.role !== 'string') {
      return Decision.deny(Reason.ROLE_NOT_PERMITTED);
    }
    if (!['technician', 'customer', 'cs_agent', 'admin'].includes(actor.role)) {
      return Decision.deny(Reason.ROLE_NOT_PERMITTED, { role: actor.role });
    }

    // 目前只有師傅需要跨商戶隔離；其他角色由權限矩陣控制
    if (actor.role !== 'technician') return Decision.allow();

    const order = resource.order || resource.orderRecord;
    if (!order) {
      return Decision.deny(Reason.RESOURCE_MISSING, { need: 'order' });
    }

    const actorMerchant = actor.merchantId || DEFAULT_MERCHANT_ID;
    const orderMerchant = order.merchantId || DEFAULT_MERCHANT_ID;

    if (actorMerchant !== orderMerchant) {
      return Decision.deny(Reason.MERCHANT_MISMATCH, {
        orderId: order.orderId || order.id,
      });
    }

    return Decision.allow();
  },
});

module.exports = { MerchantConstraint, DEFAULT_MERCHANT_ID };
