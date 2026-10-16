'use strict';

const { Decision, Reason } = require('../Decision');

/**
 * SoDConstraint —— 職責分離：**發起者不得批准**。
 *
 * ⚠️ **只登記在 `refunds.approve_large`（> 200 元）**，見 `Permission.js`。
 *
 * **為什麼 `approve_small` 不登記**（Q2 定案）：
 * 你的關鍵區分是「**SoD 防的是同一人自批，不是只有一個客服**」。
 * ≤ 200 元的單人審批是**設計**，不是違規 —— 客服中心只有一人時，
 * 退款才不會卡死。若在這裡也擋，這條規則會變成業務的阻礙而被繞過。
 *
 * **> 200 元為何天然安全**：客服發起 → 管理員審批，本來就是兩個不同角色。
 * 真正需要擋的是「管理員代客戶發起、又自己批准」這種同人情況。
 */
const SoDConstraint = Object.freeze({
  name: 'SoDConstraint',

  /**
   * @param {{ id: string, role: string }} actor 批准者
   * @param {object} resource 需含 `refund`（或直接 `requestedBy`）
   *   - `refund.requestedBy`：發起者的 userId
   *   - `refund.requestedAt`
   */
  check(actor, resource = {}) {
    const requestedBy =
      (resource.refund && resource.refund.requestedBy) || resource.requestedBy;

    if (!requestedBy) {
      // ⚠️ 沒有發起者資訊 → **拒絕**（fail-closed）。
      // 無法確認是否同人時放行，等於讓這條規則可以被「不填欄位」繞過。
      return Decision.deny(Reason.RESOURCE_MISSING, {
        need: 'refund.requestedBy',
        hint: '無法確認發起者時一律拒絕',
      });
    }

    if (requestedBy === actor.id) {
      return Decision.deny(Reason.SOD_VIOLATION, {
        action: 'refunds.approve_large',
        actorId: actor.id,
        hint: '發起退款的客服不得自行批准大額退款；請交由管理員審批',
      });
    }

    return Decision.allow();
  },
});

module.exports = { SoDConstraint };
