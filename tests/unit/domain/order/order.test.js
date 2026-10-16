'use strict';

/**
 * Order 聚合測試。
 *
 * 三條主軸：
 *   1. **狀態變更一律經過狀態機**（不合法的轉移不得悄悄發生）
 *   2. **每次變更都留下歷程並遞增 version**（樂觀鎖與稽核的基礎）
 *   3. **快照不可變**（後台改價／改比例不得影響歷史訂單）
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const { Order } = require('../../../../packages/domain/order/Order');
const { OrderStatus, canExecuteProfitSharing } = require('../../../../packages/domain/order/OrderStatus');
const { OrderItem, FeeType, ItemType } = require('../../../../packages/domain/order/OrderItem');
const { OrderSnapshot } = require('../../../../packages/domain/order/OrderSnapshot');
const { ProfitSharingTerms, SharingBase } = require('../../../../packages/domain/settlement/ProfitSharingTerms');
const { Address } = require('../../../../packages/domain/shared/Address');
const { OrderNo } = require('../../../../packages/domain/shared/OrderNo');
const { Money, Rounding } = require('../../../../packages/shared-kernel/Money');
const { IllegalStateTransition } = require('../../../../packages/shared-kernel/Errors');

const { makeOrder, makeCompletedOrder, makeItems, makeAddress, makeSnapshot } = require('../../../helpers/order');

test('建立訂單', async (t) => {
  await t.test('初始狀態為 PENDING_PAYMENT，version 為 0', () => {
    const order = makeOrder();
    assert.equal(order.statusKey, 'PENDING_PAYMENT');
    assert.equal(order.version, 0);
  });

  await t.test('建立時就留下一筆歷程', () => {
    const order = makeOrder();
    assert.equal(order.timeline.length, 1);
    assert.equal(order.timeline[0].fromKey, null);
    assert.equal(order.timeline[0].toKey, 'PENDING_PAYMENT');
    assert.equal(order.timeline[0].actorRole, 'customer');
  });

  await t.test('⚠️ 金額由 PricingService 算出，不接受呼叫方傳入總額', () => {
    const order = makeOrder({ serviceFeeCents: 10000, materialFeeCents: 2500 });
    assert.equal(order.amounts.total.cents, 12500, '總額必須來自明細，而非呼叫方');
  });

  await t.test('缺必要欄位一律拒絕', () => {
    const base = { orderId: 'o1', orderNo: new OrderNo('R20261016000001'), customerId: 'c1', createdAt: 1 };
    assert.throws(() => Order.create({ ...base, items: [], address: makeAddress(), snapshot: makeSnapshot() }), Error, '空明細');
    assert.throws(() => Order.create({ ...base, items: makeItems(), address: { province: 'x' }, snapshot: makeSnapshot() }), Error, '非 Address');
    assert.throws(() => Order.create({ ...base, items: makeItems(), address: makeAddress(), snapshot: {} }), Error, '非 OrderSnapshot');
    assert.throws(() => Order.create({ ...base, items: makeItems(), address: makeAddress(), snapshot: makeSnapshot(), createdAt: -1 }), Error, '負時間');
  });
});

test('狀態變更：一律經過狀態機', async (t) => {
  await t.test('完整生命週期', () => {
    const order = makeOrder();
    order.markPaid({ at: 1 });
    assert.equal(order.statusKey, 'PAID_PENDING_ASSIGN');
    order.assignTo('tech-1', { at: 2, by: 'cs-1' });
    assert.equal(order.statusKey, 'ASSIGNED_PENDING_ACCEPT');
    assert.equal(order.technicianId, 'tech-1');
    order.accept({ at: 3, by: 'tu1' });
    order.reportArrival({ at: 4, by: 'tu1' });
    assert.equal(order.statusKey, 'IN_SERVICE');
    order.completeService({ at: 5, by: 'tu1' });
    order.confirmCompletion({ at: 6, by: 'cs-1' });
    assert.equal(order.statusKey, 'COMPLETED');
    assert.equal(order.completedAt, 6);
  });

  await t.test('⚠️ 每次變更都追加歷程並遞增 version', () => {
    const order = makeOrder();
    const before = order.timeline.length;
    order.markPaid({ at: 1 });
    assert.equal(order.timeline.length, before + 1);
    assert.equal(order.version, 1);

    order.assignTo('tech-1', { at: 2, by: 'cs' });
    assert.equal(order.timeline.length, before + 2);
    assert.equal(order.version, 2);
  });

  await t.test('非法轉移拋 IllegalStateTransition', () => {
    const order = makeOrder();
    assert.throws(() => order.reportArrival({ at: 1, by: 'x' }), IllegalStateTransition, '未付款不得到場');
    assert.throws(() => order.confirmCompletion({ at: 1, by: 'x' }), IllegalStateTransition);
  });

  await t.test('非法轉移不會留下任何痕跡（歷程與 version 都不變）', () => {
    const order = makeOrder();
    const len = order.timeline.length;
    const ver = order.version;
    assert.throws(() => order.accept({ at: 1, by: 'x' }));
    assert.equal(order.timeline.length, len, '失敗的轉移不得寫入歷程');
    assert.equal(order.version, ver);
  });

  await t.test('拒單會清掉指派並回到待派單', () => {
    const order = makeOrder({ to: ['paid', 'assigned'] });
    assert.equal(order.technicianId, 'tech-1');
    order.reject({ at: 100, by: 'tu1', reason: '無法前往' });
    assert.equal(order.statusKey, 'PAID_PENDING_ASSIGN');
    assert.equal(order.technicianId, null, '拒單後必須清掉指派，否則會殘留錯誤的負責人');
  });

  await t.test('歷程記錄了 from / to / actor / reason', () => {
    const order = makeOrder({ to: ['paid', 'assigned'] });
    order.reject({ at: 100, by: 'tu1', reason: '無法前往' });
    const last = order.timeline[order.timeline.length - 1];
    assert.equal(last.fromKey, 'ASSIGNED_PENDING_ACCEPT');
    assert.equal(last.toKey, 'PAID_PENDING_ASSIGN');
    assert.equal(last.actorId, 'tu1');
    assert.equal(last.reason, '無法前往');
  });

  await t.test('終態不可再變更', () => {
    const order = makeOrder({ to: ['voided'] });
    assert.equal(order.isTerminal(), true);
    assert.throws(() => order.markPaid({ at: 1 }), IllegalStateTransition);
  });
});

test('作廢（VOIDED）', async (t) => {
  await t.test('未付款可直接作廢', () => {
    const order = makeOrder();
    order.voidOrder({ at: 1, by: 'admin-1', reason: '重複下單' });
    assert.equal(order.statusKey, 'VOIDED');
    assert.equal(order.voidedReason, '重複下單');
    assert.equal(order.isTerminal(), true);
  });

  await t.test('⚠️ 狀態機**允許**已付款作廢 —— 業務限制在 Use Case，不在狀態機', () => {
    const order = makeOrder({ to: ['paid'] });
    assert.doesNotThrow(() => order.voidOrder({ at: 2, by: 'admin-1', reason: '詐欺' }));
    assert.equal(order.statusKey, 'VOIDED');
    // 註：真實情境由 P5 的 VoidOrderUseCase 強制「已付款作廢必須先退款」
  });

  await t.test('作廢後的訂單不可分帳', () => {
    const order = makeOrder({ to: ['voided'] });
    assert.equal(canExecuteProfitSharing(order.status), false);
  });
});

test('爭議（DISPUTED）', async (t) => {
  await t.test('可自 PENDING_ACCEPTANCE 進入，並凍結分帳', () => {
    const order = makeOrder({ to: ['paid', 'assigned', 'accepted', 'arrived', 'completed_service'] });
    order.raiseDispute({ at: 100, by: 'cust-1', reason: '服務不符預期' });
    assert.equal(order.statusKey, 'DISPUTED');
    assert.equal(canExecuteProfitSharing(order.status), false, '爭議中必須凍結分帳');
  });

  await t.test('裁定後可回到 COMPLETED 或退款結案', () => {
    const a = makeOrder({ orderId: 'a', to: ['paid', 'assigned', 'accepted', 'arrived', 'completed_service', 'disputed'] });
    a.resolveDispute({ outcome: 'COMPLETED', at: 200, by: 'cs-1' });
    assert.equal(a.statusKey, 'COMPLETED');

    const b = makeOrder({ orderId: 'b', to: ['paid', 'assigned', 'accepted', 'arrived', 'completed_service', 'disputed'] });
    b.resolveDispute({ outcome: 'CLOSED_REFUNDED', at: 200, by: 'cs-1' });
    assert.equal(b.statusKey, 'CLOSED_REFUNDED');
  });
});

test('⚠️ 快照不可變（後台改價／改比例不得影響歷史訂單）', async (t) => {
  await t.test('訂單的明細快照在建立後固定', () => {
    const order = makeOrder();
    const snapshotPrice = order.items[0].unitPriceSnapshot.cents;

    // 模擬「後台改了商品價格」—— 我們沒有任何 API 能改動訂單上的快照
    assert.equal(order.items[0].unitPriceSnapshot.cents, snapshotPrice);
    assert.throws(() => {
      'use strict';
      order.items[0].unitPriceSnapshot = Money.fromCents(99999);
    }, TypeError, 'items 是唯讀副本');
  });

  await t.test('分潤條款凍結在建立當下', () => {
    const order = makeOrder({ technicianRateBp: 8000, platformRateBp: 2000 });
    assert.equal(order.snapshot.technicianRateBp, 8000);

    // 即使外面有「新的」條款，訂單仍用舊的
    const newTerms = new ProfitSharingTerms({
      base: SharingBase.SERVICE_FEE,
      technicianRateBp: 5000,
      platformRateBp: 5000,
      roundingMode: Rounding.FLOOR_TO_CENT,
      termsVersion: 'v2',
    });
    assert.equal(newTerms.technicianRateBp, 5000);
    assert.equal(order.snapshot.technicianRateBp, 8000, '訂單必須保留自己的快照');
    assert.equal(order.snapshot.pricingVersion, 'p1');
  });

  await t.test('Address / 快照物件本身被凍結', () => {
    const order = makeOrder();
    assert.throws(() => {
      'use strict';
      order.address.props.detailAddress = '改掉了';
    }, TypeError);
  });
});

test('持久化往返', async (t) => {
  await t.test('toPersistence → rehydrate 完整還原', () => {
    const order = makeCompletedOrder({ serviceFeeCents: 10000, materialFeeCents: 2500 });
    const restored = Order.rehydrate(order.toPersistence());

    assert.equal(restored.statusKey, order.statusKey);
    assert.equal(restored.version, order.version);
    assert.equal(restored.technicianId, order.technicianId);
    assert.equal(restored.amounts.total.cents, order.amounts.total.cents);
    assert.equal(restored.amounts.serviceFee.cents, order.amounts.serviceFee.cents);
    assert.equal(restored.timeline.length, order.timeline.length);
    assert.equal(restored.snapshot.technicianRateBp, order.snapshot.technicianRateBp);
    assert.equal(restored.snapshot.pricingVersion, order.snapshot.pricingVersion);
    assert.equal(restored.items.length, order.items.length);
    assert.equal(restored.items[0].nameSnapshot, order.items[0].nameSnapshot);
    assert.equal(restored.items[0].unitPriceSnapshot.cents, order.items[0].unitPriceSnapshot.cents);
    assert.equal(restored.completedAt, order.completedAt);
  });

  await t.test('還原後仍可繼續轉移（快照與金額有正確重建）', () => {
    const order = makeOrder({ to: ['paid', 'assigned', 'accepted', 'arrived'] });
    const restored = Order.rehydrate(order.toPersistence());
    restored.completeService({ at: 999, by: 'tu1' });
    assert.equal(restored.statusKey, 'PENDING_ACCEPTANCE');
  });

  await t.test('作廢理由也會往返', () => {
    const order = makeOrder({ to: ['voided'] });
    const restored = Order.rehydrate(order.toPersistence());
    assert.equal(restored.statusKey, 'VOIDED');
    assert.equal(restored.voidedReason, '重複下單');
  });
});

test('toSnapshot 供稽核', async (t) => {
  await t.test('是純資料，不含方法或巢狀實例', () => {
    const snap = makeCompletedOrder().toSnapshot();
    assert.equal(typeof snap, 'object');
    assert.equal(typeof snap.status, 'string');
    assert.equal(typeof snap.totalCents, 'number');
    assert.equal(snap.items, undefined, 'toSnapshot 是摘要，不含明細');
    // 可安全序列化
    assert.doesNotThrow(() => JSON.stringify(snap));
  });

  await t.test('含稽核需要的關鍵欄位', () => {
    const snap = makeCompletedOrder().toSnapshot();
    for (const key of ['orderId', 'orderNo', 'status', 'statusValue', 'technicianId', 'totalCents', 'version']) {
      assert.ok(key in snap, `缺少 ${key}`);
    }
  });
});

test('聚合不知道權限（職責邊界）', async (t) => {
  await t.test('方法簽章沒有 actor 的角色參數', () => {
    const order = makeOrder({ to: ['paid', 'assigned'] });
    // accept 只看狀態機，不看「你是誰」—— 權限判斷在 Use Case 進入前由 AccessPolicy 完成
    assert.doesNotThrow(() => order.accept({ at: 1, by: 'anyone' }));
  });

  await t.test('狀態機不提供角色查詢', () => {
    const machine = makeOrder().stateMachine();
    assert.equal('allowedRoles' in machine.describe(), false);
  });
});
