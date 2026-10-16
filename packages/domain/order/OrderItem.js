'use strict';

const { Money } = require('@repair/shared-kernel/Money');
const { invariant, assertNonEmptyString, assertInteger, assertOneOf } = require('../shared/assertions');
const { CommissionRate } = require('../shared/CommissionRate');

/**
 * OrderItem —— 訂單明細（聚合內實體）。
 *
 * **核心設計：價格快照。**
 * 下單當下把名稱、規格、單價、分潤比例複製進來，之後**永不回查** `services` / `products`。
 * 這是「後台改價不影響歷史訂單」的實作基礎（你的業務規則 4）。
 *
 * 明細建立後不可變 —— 訂單的內容不會改變，退款是另一條軌跡（`refund_records`）。
 */

/** 明細類型 */
const ItemType = Object.freeze({
  SERVICE: 'service',
  PRODUCT: 'product',
});

/** 費用歸屬：決定退款與分潤的歸類 */
const FeeType = Object.freeze({
  SERVICE_FEE: 'SERVICE_FEE',
  MATERIAL_FEE: 'MATERIAL_FEE',
});

const ITEM_TYPES = Object.freeze(Object.values(ItemType));
const FEE_TYPES = Object.freeze(Object.values(FeeType));

class OrderItem {
  #props;

  /**
   * @param {object} props
   * @param {string} props.itemType            ItemType 之一
   * @param {string} props.itemRefId           指向 services / products（僅作溯源）
   * @param {string} props.nameSnapshot        **下單當下**的名稱
   * @param {string} [props.specSnapshot]      下單當下的規格描述
   * @param {Money}  props.unitPriceSnapshot   **下單當下**的單價
   * @param {number} props.quantity
   * @param {string} props.feeType             FeeType 之一
   * @param {number} props.commissionRateBpSnapshot **下單當下**的分潤比例
   */
  constructor(props) {
    assertOneOf(props.itemType, ITEM_TYPES, 'OrderItem.itemType');
    assertOneOf(props.feeType, FEE_TYPES, 'OrderItem.feeType');
    assertNonEmptyString(props.itemRefId, 'OrderItem.itemRefId');
    assertNonEmptyString(props.nameSnapshot, 'OrderItem.nameSnapshot');
    assertInteger(props.quantity, 'OrderItem.quantity', { min: 1 });
    invariant(props.unitPriceSnapshot instanceof Money, 'OrderItem.unitPriceSnapshot 必須是 Money');

    // 分潤比例必須合法（0–10000 bp）。用 CommissionRate 驗證後存原始值，
    // 避免在 props 中放入值物件實例（序列化與深拷貝都要處理）。
    CommissionRate.fromBp(props.commissionRateBpSnapshot);

    this.#props = Object.freeze({
      itemType: props.itemType,
      itemRefId: props.itemRefId,
      nameSnapshot: props.nameSnapshot,
      specSnapshot: props.specSnapshot || '',
      unitPriceSnapshot: props.unitPriceSnapshot,
      quantity: props.quantity,
      feeType: props.feeType,
      commissionRateBpSnapshot: props.commissionRateBpSnapshot,
    });
  }

  get itemType() { return this.#props.itemType; }
  get itemRefId() { return this.#props.itemRefId; }
  get nameSnapshot() { return this.#props.nameSnapshot; }
  get specSnapshot() { return this.#props.specSnapshot; }
  get unitPriceSnapshot() { return this.#props.unitPriceSnapshot; }
  get quantity() { return this.#props.quantity; }
  get feeType() { return this.#props.feeType; }
  get commissionRateBpSnapshot() { return this.#props.commissionRateBpSnapshot; }

  /** 小計 = 單價 × 數量。幣別繼承自單價快照。 */
  get amount() {
    return this.#props.unitPriceSnapshot.multiply(this.#props.quantity);
  }

  isServiceFee() {
    return this.#props.feeType === FeeType.SERVICE_FEE;
  }

  isMaterialFee() {
    return this.#props.feeType === FeeType.MATERIAL_FEE;
  }

  toJSON() {
    return {
      itemType: this.#props.itemType,
      itemRefId: this.#props.itemRefId,
      nameSnapshot: this.#props.nameSnapshot,
      specSnapshot: this.#props.specSnapshot,
      unitPriceCents: this.#props.unitPriceSnapshot.cents,
      currency: this.#props.unitPriceSnapshot.currency,
      quantity: this.#props.quantity,
      feeType: this.#props.feeType,
      commissionRateBpSnapshot: this.#props.commissionRateBpSnapshot,
    };
  }

  /** 從持久化形狀還原 */
  static rehydrate(row) {
    return new OrderItem({
      itemType: row.itemType,
      itemRefId: row.itemRefId,
      nameSnapshot: row.nameSnapshot,
      specSnapshot: row.specSnapshot,
      unitPriceSnapshot: Money.fromCents(row.unitPriceCents, row.currency),
      quantity: row.quantity,
      feeType: row.feeType,
      commissionRateBpSnapshot: row.commissionRateBpSnapshot,
    });
  }
}

module.exports = { OrderItem, ItemType, FeeType, ITEM_TYPES, FEE_TYPES };
