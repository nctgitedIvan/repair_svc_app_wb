'use strict';

const { Decision, Reason } = require('../Decision');

/**
 * OwnershipConstraint —— 資源歸屬。
 *
 * 「屬於」的定義各角色不同：
 *   - `customer`   → 訂單的 `customerId` 等於自己
 *   - `technician` → 訂單的 `technicianId` 等於自己的 `technicianId`
 *   - 其他角色      → 由角色矩陣決定，不走歸屬約束
 *
 * **這是純 RBAC 做不到的那一層**（docs/01 §4.7.1）：
 * RBAC 只能說「師傅可讀訂單」，這裡才能說「只能讀**被指派給自己**的訂單」。
 */
const OwnershipConstraint = Object.freeze({
  name: 'OwnershipConstraint',

  /**
   * @param {{ id: string, role: string, technicianId?: string }} actor
   * @param {object} resource 需含 `order`（或 `orderId` + `ownerId` 等替代形狀）
   */
  check(actor, resource = {}) {
    const order = resource.order || resource.orderRecord;

    if (!order) {
      // 沒有資源可判斷時**拒絕**，不是放行 —— fail-closed
      return Decision.deny(Reason.RESOURCE_MISSING, { need: 'order' });
    }

    switch (actor.role) {
      case 'customer': {
        const ownerId = order.customerId;
        // actor.id 是 userId；actor.customerId 是 customers 集合的 id（若已解析）
        const actorOwnerId = actor.customerId || actor.id;
        if (!ownerId || ownerId !== actorOwnerId) {
          return Decision.deny(Reason.NOT_OWNER, { orderId: order.orderId || order.id });
        }
        return Decision.allow();
      }

      case 'technician': {
        const assigned = order.technicianId;
        if (!actor.technicianId || !assigned || assigned !== actor.technicianId) {
          return Decision.deny(Reason.NOT_ASSIGNED_TECHNICIAN, { orderId: order.orderId || order.id });
        }
        return Decision.allow();
      }

      case 'cs_agent':
      case 'admin':
        // 這兩個角色的可見範圍由角色矩陣／權限組決定（例如 read_all），
        // 不走歸屬約束。若需要限制必須另加 constraint。
        return Decision.allow();

      default:
        return Decision.deny(Reason.ROLE_NOT_PERMITTED, { role: actor.role });
    }
  },
});

module.exports = { OwnershipConstraint };
