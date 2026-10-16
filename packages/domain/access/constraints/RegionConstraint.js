'use strict';

const { Decision, Reason } = require('../Decision');

/**
 * RegionConstraint —— 區域範圍。
 *
 * 客服只能派「自己負責區域」的師傅；只能看自己區域的派單統計。
 *
 * 慣例：`actor.regions` 含 `'*'` 代表**全區**（通常給 admin 或資深客服）。
 */
const RegionConstraint = Object.freeze({
  name: 'RegionConstraint',

  /**
   * @param {{ role: string, regions?: string[] }} actor
   * @param {object} resource 需含區域資訊：`technician.regionCode` 或 `regionCode`
   */
  check(actor, resource = {}) {
    const regions = Array.isArray(actor.regions) ? actor.regions : [];
    if (regions.includes('*')) return Decision.allow();

    const target =
      (resource.technician && resource.technician.regionCode) ||
      resource.regionCode ||
      (resource.order && resource.order.regionCode);

    if (!target) {
      // ⚠️ 無區域資訊 → **拒絕**（fail-closed）。
      // 沒有區域資料就不能確認客服是否有權，放行等於讓約束形同虛設。
      return Decision.deny(Reason.RESOURCE_MISSING, { need: 'regionCode' });
    }

    if (regions.length === 0) {
      return Decision.deny(Reason.OUT_OF_REGION, { target, actorRegions: [] });
    }

    if (!regions.includes(target)) {
      return Decision.deny(Reason.OUT_OF_REGION, { target, actorRegions: regions });
    }

    return Decision.allow();
  },
});

module.exports = { RegionConstraint };
