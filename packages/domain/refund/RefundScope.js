'use strict';

const { ValueObject } = require('../shared/ValueObject');
const { invariant, assertOneOf, assertArray } = require('../shared/assertions');

/**
 * RefundScope —— **退什麼**（範圍）。
 *
 * 與 `RefundPolicy` 的分工：
 *   - `RefundScope` 回答「**要退哪些項目**」
 *   - `RefundPolicy` 回答「**能不能退、退多少**」（累計上限、次數上限）
 *
 * 你的業務規則 5 要求「只退服務費／只退材料費／全額」——
 * 這三者都是**範圍**，不是三套不同的退款程式。
 * A6 決策：另支援「按明細項勾選」。
 *
 * 對應 docs/01 §3.1、A6。
 */

const RefundScopeType = Object.freeze({
  /** 只退服務費（依 item 的 feeType 加總） */
  SERVICE_ONLY: 'SERVICE_ONLY',
  /** 只退材料費 */
  MATERIAL_ONLY: 'MATERIAL_ONLY',
  /** 全額退款 */
  FULL: 'FULL',
  /** 自訂部分退款：**按明細項勾選**（A6：不開放任意金額） */
  CUSTOM_ITEMS: 'CUSTOM_ITEMS',
});

const ALL_TYPES = Object.freeze(Object.values(RefundScopeType));

class RefundScope extends ValueObject {
  /**
   * @param {string} type RefundScopeType 之一
   * @param {number[]} [itemIndexes] CUSTOM_ITEMS 時必填，指向 `order.items` 的索引
   */
  constructor(type, itemIndexes = null) {
    assertOneOf(type, ALL_TYPES, 'RefundScope.type');

    if (type === RefundScopeType.CUSTOM_ITEMS) {
      assertArray(itemIndexes, 'RefundScope.itemIndexes');
      invariant(itemIndexes.length > 0, 'CUSTOM_ITEMS 至少要勾選一個明細項');
      for (const idx of itemIndexes) {
        invariant(Number.isInteger(idx) && idx >= 0, `itemIndexes 必須是非負整數，收到：${idx}`);
      }
      invariant(
        new Set(itemIndexes).size === itemIndexes.length,
        'itemIndexes 不得重複（重複會導致金額重複計算）',
      );
    } else {
      invariant(
        itemIndexes === null || itemIndexes === undefined,
        '只有 CUSTOM_ITEMS 才能帶 itemIndexes',
      );
    }

    super({
      type,
      itemIndexes: type === RefundScopeType.CUSTOM_ITEMS ? [...itemIndexes].sort((a, b) => a - b) : null,
    });
  }

  static serviceOnly() { return new RefundScope(RefundScopeType.SERVICE_ONLY); }
  static materialOnly() { return new RefundScope(RefundScopeType.MATERIAL_ONLY); }
  static full() { return new RefundScope(RefundScopeType.FULL); }
  static customItems(indexes) { return new RefundScope(RefundScopeType.CUSTOM_ITEMS, indexes); }

  get type() { return this.props.type; }
  get itemIndexes() { return this.props.itemIndexes ? [...this.props.itemIndexes] : null; }

  isFull() { return this.props.type === RefundScopeType.FULL; }
  isCustom() { return this.props.type === RefundScopeType.CUSTOM_ITEMS; }

  /**
   * 這個明細項是否在退款範圍內？
   * @param {object} item OrderItem
   * @param {number} index 該 item 在 `order.items` 中的索引
   */
  includes(item, index) {
    switch (this.props.type) {
      case RefundScopeType.FULL:
        return true;
      case RefundScopeType.SERVICE_ONLY:
        return item.isServiceFee();
      case RefundScopeType.MATERIAL_ONLY:
        return item.isMaterialFee();
      case RefundScopeType.CUSTOM_ITEMS:
        return this.props.itemIndexes.includes(index);
      default:
        return false;
    }
  }

  toJSON() {
    return { type: this.props.type, itemIndexes: this.props.itemIndexes };
  }
}

module.exports = { RefundScope, RefundScopeType, ALL_TYPES };
