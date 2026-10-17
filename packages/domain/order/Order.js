'use strict';

const { Money } = require('@repair/shared-kernel/Money');
const { invariant, assertNonEmptyString, assertInteger, assertArray } = require('../shared/assertions');
const { OrderStatus, fromValue } = require('./OrderStatus');
const { OrderStateMachine } = require('./OrderStateMachine');
const { OrderItem } = require('./OrderItem');
const { OrderStatusLog } = require('./OrderStatusLog');
const { OrderSnapshot } = require('./OrderSnapshot');
const { ProfitSharingTerms } = require('../settlement/ProfitSharingTerms');
const { Address } = require('../shared/Address');
const { OrderNo } = require('../shared/OrderNo');
const { priceItems } = require('./PricingService');

/**
 * 單筆訂單的明細上限。
 *
 * 為什麼是 50：雲開發事務最多 100 次單記錄操作，而 `save()` 需要
 * 1 次訂單 + N 次明細 + M 次歷程。留一半給歷程與其他寫入，明細上限取 50。
 */
const MAX_ORDER_ITEMS = 50;

/**
 * Order —— 訂單聚合根。
 *
 * 設計要點：
 *  1. **所有狀態變更都經過狀態機**（`OrderStateMachine`），不合法直接拋錯。
 *  2. **每次變更都追加 `OrderStatusLog`** 並遞增 `version`（供樂觀鎖）。
 *  3. **金額與分潤條款來自快照**，不回查目錄或當前配置。
 *  4. 聚合**不知道**誰有權限 —— 那是 `AccessPolicy`（P4c）的職責。
 *     這裡的 `by` 只進歷程紀錄，不做權限判斷。
 *
 * 對應 docs/01-目標架構.md §3.2。
 */
class Order {
  #props;

  constructor(props) {
    this.#props = {
      orderId: props.orderId,
      orderNo: props.orderNo,
      /** 多租戶預留：目前所有資料都屬於平台 */
      merchantId: props.merchantId || 'platform',
      customerId: props.customerId,
      csAgentId: props.csAgentId || null,
      technicianId: props.technicianId || null,
      status: props.status,
      items: props.items,
      amounts: props.amounts,
      address: props.address,
      appointmentAt: props.appointmentAt || null,
      snapshot: props.snapshot,
      timeline: props.timeline,
      version: props.version,
      currency: props.currency || 'CNY',
      createdAt: props.createdAt,
      paidAt: props.paidAt || null,
      completedAt: props.completedAt || null,
      voidedReason: props.voidedReason || null,
    };
  }

  /**
   * 建立新訂單（狀態固定為 `PENDING_PAYMENT`）。
   *
   * ⚠️ 金額由 `PricingService` 從明細算出，**不接受呼叫方傳入總額** ——
   *    讓「前端傳來的金額」不可能覆蓋真實計算結果。
   */
  static create(props) {
    assertNonEmptyString(props.orderId, 'Order.orderId');
    assertArray(props.items, 'Order.items');
    invariant(props.items.length > 0, '訂單至少要有一個明細');
    invariant(
      props.items.length <= MAX_ORDER_ITEMS,
      `訂單明細不得超過 ${MAX_ORDER_ITEMS} 筆（雲開發事務操作數上限）`,
      { itemCount: props.items.length, max: MAX_ORDER_ITEMS },
    );
    invariant(props.orderNo instanceof OrderNo, 'Order.orderNo 必須是 OrderNo');
    invariant(props.address instanceof Address, 'Order.address 必須是 Address');
    invariant(props.snapshot instanceof OrderSnapshot, 'Order.snapshot 必須是 OrderSnapshot');
    assertInteger(props.createdAt, 'Order.createdAt', { min: 0 });

    const amounts = priceItems(props.items);

    return new Order({
      ...props,
      status: OrderStatus.PENDING_PAYMENT,
      amounts: { serviceFee: amounts.serviceFee, materialFee: amounts.materialFee, total: amounts.total },
      currency: amounts.currency,
      timeline: [
        new OrderStatusLog({
          fromKey: null,
          toKey: OrderStatus.PENDING_PAYMENT.key,
          actorId: props.customerId,
          actorRole: 'customer',
          at: props.createdAt,
          reason: '客戶下單',
        }),
      ],
      version: 0,
    });
  }

  /** 從持久化形狀還原（**不驗證轉移** —— 這是重建，不是變更） */
  static rehydrate(row) {
    return new Order({
      orderId: row.orderId,
      orderNo: new OrderNo(row.orderNo),
      merchantId: row.merchantId || 'platform',
      customerId: row.customerId,
      csAgentId: row.csAgentId,
      technicianId: row.technicianId,
      status: fromValue(row.statusValue),
      items: row.items.map(OrderItem.rehydrate),
      amounts: {
        serviceFee: Money.fromCents(row.serviceFeeCents, row.currency),
        materialFee: Money.fromCents(row.materialFeeCents, row.currency),
        total: Money.fromCents(row.totalCents, row.currency),
      },
      address: new Address(row.address),
      appointmentAt: row.appointmentAt,
      snapshot: new OrderSnapshot({
        // 持久化形狀是純資料，需重建值物件
        profitSharingTerms: new ProfitSharingTerms(row.snapshot.profitSharingTerms),
        pricingVersion: row.snapshot.pricingVersion,
      }),
      timeline: (row.timeline || []).map(OrderStatusLog.rehydrate),
      version: row.version,
      currency: row.currency,
      createdAt: row.createdAt,
      paidAt: row.paidAt,
      completedAt: row.completedAt,
      voidedReason: row.voidedReason,
    });
  }

  // ── 取值 ──

  get id() { return this.#props.orderId; }
  get orderNo() { return this.#props.orderNo; }
  get merchantId() { return this.#props.merchantId; }
  get customerId() { return this.#props.customerId; }
  get csAgentId() { return this.#props.csAgentId; }
  get technicianId() { return this.#props.technicianId; }
  get status() { return this.#props.status; }
  get statusKey() { return this.#props.status.key; }
  get items() { return [...this.#props.items]; }
  get amounts() { return { ...this.#props.amounts }; }
  get address() { return this.#props.address; }
  get appointmentAt() { return this.#props.appointmentAt; }
  get snapshot() { return this.#props.snapshot; }
  get timeline() { return [...this.#props.timeline]; }
  get version() { return this.#props.version; }
  get createdAt() { return this.#props.createdAt; }
  get completedAt() { return this.#props.completedAt; }
  get voidedReason() { return this.#props.voidedReason; }

  stateMachine() {
    return OrderStateMachine.for(this.#props.status);
  }

  isTerminal() {
    return this.stateMachine().isTerminal();
  }

  // ── 狀態變更（全部經過狀態機） ──

  /** 客服派單（可重複呼叫以改派） */
  assignTo(technicianId, { at, by }) {
    assertNonEmptyString(technicianId, 'assignTo.technicianId');
    this.#transitionTo(OrderStatus.ASSIGNED_PENDING_ACCEPT, { at, by, reason: null });
    this.#props.technicianId = technicianId;
    return this;
  }

  accept({ at, by }) {
    return this.#transitionTo(OrderStatus.ACCEPTED_PENDING_VISIT, { at, by });
  }

  reject({ at, by, reason }) {
    this.#transitionTo(OrderStatus.PAID_PENDING_ASSIGN, { at, by, reason });
    this.#props.technicianId = null; // 拒單後回到待派單，必須清掉指派
    return this;
  }

  reportArrival({ at, by }) {
    return this.#transitionTo(OrderStatus.IN_SERVICE, { at, by });
  }

  completeService({ at, by }) {
    return this.#transitionTo(OrderStatus.PENDING_ACCEPTANCE, { at, by });
  }

  confirmCompletion({ at, by }) {
    this.#transitionTo(OrderStatus.COMPLETED, { at, by });
    this.#props.completedAt = at;
    return this;
  }

  raiseDispute({ at, by, reason }) {
    return this.#transitionTo(OrderStatus.DISPUTED, { at, by, reason });
  }

  /** @param {string} outcome 'COMPLETED' | 'CLOSED_REFUNDED' | 'IN_SERVICE' */
  resolveDispute({ outcome, at, by, reason }) {
    return this.#transitionTo(OrderStatus[outcome], { at, by, reason });
  }

  cancel({ at, by, reason }) {
    return this.#transitionTo(OrderStatus.CANCELED_PAID_REFUNDED, { at, by, reason });
  }

  /**
   * 平台作廢（軟刪除）。
   *
   * ⚠️ 這裡**只檢查狀態機**。「已付款作廢必須先退款」「已完成不能作廢」
   *    是業務規則，由 P5 的 `VoidOrderUseCase` 與 P4c 的 `ApprovalPolicy` 強制。
   */
  voidOrder({ at, by, reason }) {
    this.#transitionTo(OrderStatus.VOIDED, { at, by, reason });
    this.#props.voidedReason = reason || null;
    return this;
  }

  /** 支付成功（由 payment-callback 觸發，非使用者操作） */
  markPaid({ at, by = 'system' }) {
    this.#transitionTo(OrderStatus.PAID_PENDING_ASSIGN, { at, by, actorRole: 'system' });
    this.#props.paidAt = at;
    return this;
  }

  /** 逾時（由定時任務觸發，非使用者操作） */
  markExpired({ targetKey, at, reason }) {
    return this.#transitionTo(OrderStatus[targetKey], { at, by: 'system', actorRole: 'system', reason });
  }

  // ── 審計與持久化 ──

  /** 供稽核的 before/after 快照（純資料，不含方法） */
  toSnapshot() {
    return {
      orderId: this.#props.orderId,
      orderNo: this.#props.orderNo.value,
      merchantId: this.#props.merchantId,
      status: this.#props.status.key,
      statusValue: this.#props.status.value,
      customerId: this.#props.customerId,
      csAgentId: this.#props.csAgentId,
      technicianId: this.#props.technicianId,
      serviceFeeCents: this.#props.amounts.serviceFee.cents,
      materialFeeCents: this.#props.amounts.materialFee.cents,
      totalCents: this.#props.amounts.total.cents,
      currency: this.#props.currency,
      itemCount: this.#props.items.length,
      version: this.#props.version,
      completedAt: this.#props.completedAt,
      voidedReason: this.#props.voidedReason,
    };
  }

  /** 供 Repository 持久化的完整形狀 */
  toPersistence() {
    return {
      orderId: this.#props.orderId,
      orderNo: this.#props.orderNo.value,
      merchantId: this.#props.merchantId,
      customerId: this.#props.customerId,
      csAgentId: this.#props.csAgentId,
      technicianId: this.#props.technicianId,
      statusValue: this.#props.status.value,
      items: this.#props.items.map((i) => i.toJSON()),
      serviceFeeCents: this.#props.amounts.serviceFee.cents,
      materialFeeCents: this.#props.amounts.materialFee.cents,
      totalCents: this.#props.amounts.total.cents,
      currency: this.#props.currency,
      address: {
        province: this.#props.address.province,
        city: this.#props.address.city,
        district: this.#props.address.district,
        street: this.#props.address.street,
        detailAddress: this.#props.address.detailAddress,
      },
      appointmentAt: this.#props.appointmentAt,
      snapshot: {
        profitSharingTerms: this.#props.snapshot.profitSharingTerms.toJSON(),
        pricingVersion: this.#props.snapshot.pricingVersion,
      },
      timeline: this.#props.timeline.map((l) => l.toJSON()),
      version: this.#props.version,
      createdAt: this.#props.createdAt,
      paidAt: this.#props.paidAt,
      completedAt: this.#props.completedAt,
      voidedReason: this.#props.voidedReason,
    };
  }

  // ── 內部 ──

  #transitionTo(targetStatus, { at, by, reason = null, actorRole = null }) {
    const machine = this.stateMachine();
    machine.assertCanTransitionTo(targetStatus); // 不合法 → 拋 IllegalStateTransition

    assertInteger(at, 'transition.at', { min: 0 });
    assertNonEmptyString(by, 'transition.by');

    this.#props.timeline.push(
      new OrderStatusLog({
        fromKey: this.#props.status.key,
        toKey: targetStatus.key,
        actorId: by,
        actorRole: actorRole || 'unknown',
        at,
        reason,
      }),
    );
    this.#props.status = targetStatus;
    this.#props.version += 1;
    return this;
  }
}

module.exports = { Order, MAX_ORDER_ITEMS };
