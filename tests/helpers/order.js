'use strict';

/**
 * 訂單測試資料工廠。
 *
 * 讓各測試不必重複 20 行的聚合建構 —— 也讓「訂單長什麼樣」只有一份定義，
 * 未來 `Order` 的建構參數改變時只需改這裡。
 */

const { Money, Rounding } = require('../../packages/shared-kernel/Money');
const { Order } = require('../../packages/domain/order/Order');
const { OrderItem, ItemType, FeeType } = require('../../packages/domain/order/OrderItem');
const { OrderSnapshot } = require('../../packages/domain/order/OrderSnapshot');
const { ProfitSharingTerms, SharingBase } = require('../../packages/domain/settlement/ProfitSharingTerms');
const { Address } = require('../../packages/domain/shared/Address');
const { OrderNo } = require('../../packages/domain/shared/OrderNo');

const FIXED_CREATED_AT = 1_700_000_000_000;

/** 標準的兩項明細：服務費 100 元 + 材料費 25 元（單價，數量 1） */
function makeItems({
  serviceFeeCents = 10000,
  materialFeeCents = 2500,
  commissionRateBp = 8000,
  currency = 'CNY',
} = {}) {
  const items = [
    new OrderItem({
      itemType: ItemType.SERVICE,
      itemRefId: 'svc-1',
      nameSnapshot: '冷氣維修服務',
      specSnapshot: '標準清洗',
      unitPriceSnapshot: Money.fromCents(serviceFeeCents, currency),
      quantity: 1,
      feeType: FeeType.SERVICE_FEE,
      commissionRateBpSnapshot: commissionRateBp,
    }),
  ];
  if (materialFeeCents > 0) {
    items.push(
      new OrderItem({
        itemType: ItemType.PRODUCT,
        itemRefId: 'prd-1',
        nameSnapshot: '冷媒 R410',
        unitPriceSnapshot: Money.fromCents(materialFeeCents, currency),
        quantity: 1,
        feeType: FeeType.MATERIAL_FEE,
        commissionRateBpSnapshot: commissionRateBp,
      }),
    );
  }
  return items;
}

function makeAddress() {
  return new Address({
    province: '廣東省',
    city: '深圳市',
    district: '寶安區',
    street: '沙井街道',
    detailAddress: '中心路28號3棟5B',
  });
}

function makeSnapshot({
  technicianRateBp = 8000,
  platformRateBp = 2000,
  base = SharingBase.SERVICE_FEE,
  pricingVersion = 'p1',
} = {}) {
  return new OrderSnapshot({
    profitSharingTerms: new ProfitSharingTerms({
      base,
      technicianRateBp,
      platformRateBp,
      roundingMode: Rounding.FLOOR_TO_CENT,
      termsVersion: 'v1',
    }),
    pricingVersion,
  });
}

/**
 * 建立一張訂單（預設為 `PENDING_PAYMENT`）。
 *
 * @param {object} [overrides]
 * @param {string[]} [overrides.to] 便利參數：依序推進的狀態捷徑
 *        可用值：'paid' | 'assigned' | 'accepted' | 'arrived' | 'completed_service'
 *                | 'completed' | 'disputed' | 'voided'
 */
function makeOrder(overrides = {}) {
  const {
    orderId = 'order-1',
    orderNo = 'R20261016000001',
    customerId = 'cust-1',
    createdAt = FIXED_CREATED_AT,
    technicianId = 'tech-1',
    to = [],
    ...rest
  } = overrides;

  const order = Order.create({
    orderId,
    orderNo: new OrderNo(orderNo),
    merchantId: rest.merchantId,
    customerId,
    items: rest.items || makeItems(rest),
    address: rest.address || makeAddress(),
    appointmentAt: rest.appointmentAt ?? createdAt + 86_400_000,
    snapshot: rest.snapshot || makeSnapshot(rest),
    createdAt,
  });

  const AT = createdAt + 1000;
  const advance = {
    paid: () => order.markPaid({ at: AT }),
    assigned: () => order.assignTo(technicianId, { at: AT, by: 'cs-1' }),
    accepted: () => order.accept({ at: AT, by: `user-${technicianId}` }),
    arrived: () => order.reportArrival({ at: AT, by: `user-${technicianId}` }),
    completed_service: () => order.completeService({ at: AT, by: `user-${technicianId}` }),
    completed: () => order.confirmCompletion({ at: AT, by: 'cs-1' }),
    disputed: () => order.raiseDispute({ at: AT, by: 'cust-1', reason: '服務不符預期' }),
    voided: () => order.voidOrder({ at: AT, by: 'admin-1', reason: '重複下單' }),
  };

  for (const step of to) {
    if (!advance[step]) throw new TypeError(`未知的狀態捷徑：${step}`);
    advance[step]();
  }

  return order;
}

/** 常用組合：已完成（可分帳） */
function makeCompletedOrder(overrides = {}) {
  return makeOrder({ ...overrides, to: ['paid', 'assigned', 'accepted', 'arrived', 'completed_service', 'completed'] });
}

module.exports = {
  makeOrder,
  makeCompletedOrder,
  makeItems,
  makeAddress,
  makeSnapshot,
  FIXED_CREATED_AT,
};
