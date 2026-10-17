'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { CreateOrderUseCase } = require('../../../packages/application/order/CreateOrderUseCase');
const { PayOrderUseCase } = require('../../../packages/application/order/PayOrderUseCase');
const { AssignOrderUseCase } = require('../../../packages/application/order/AssignOrderUseCase');
const { AcceptOrderUseCase } = require('../../../packages/application/order/AcceptOrderUseCase');
const { CompleteOrderUseCase } = require('../../../packages/application/order/CompleteOrderUseCase');
const { ApproveCompletionUseCase } = require('../../../packages/application/order/ApproveCompletionUseCase');
const { RequestRefundUseCase } = require('../../../packages/application/order/RequestRefundUseCase');
const { ApproveRefundUseCase } = require('../../../packages/application/order/ApproveRefundUseCase');
const { ExecuteProfitSharingUseCase } = require('../../../packages/application/order/ExecuteProfitSharingUseCase');

const { InMemoryOrderRepository } = require('../../../packages/adapters/inmemory/InMemoryOrderRepository');
const { InMemoryProductRepository } = require('../../../packages/adapters/inmemory/InMemoryProductRepository');
const { InMemoryServiceRepository } = require('../../../packages/adapters/inmemory/InMemoryServiceRepository');
const { InMemoryCustomerRepository } = require('../../../packages/adapters/inmemory/InMemoryCustomerRepository');
const { InMemoryCsAgentRepository } = require('../../../packages/adapters/inmemory/InMemoryCsAgentRepository');
const { InMemoryTechnicianRepository } = require('../../../packages/adapters/inmemory/InMemoryTechnicianRepository');
const { InMemoryAuditLogRepository } = require('../../../packages/adapters/inmemory/InMemoryAuditLogRepository');
const { InMemoryIdSequenceRepository } = require('../../../packages/adapters/inmemory/InMemoryIdSequenceRepository');
const { InMemoryPaymentRepository } = require('../../../packages/adapters/inmemory/InMemoryPaymentRepository');
const { InMemoryRefundRepository } = require('../../../packages/adapters/inmemory/InMemoryRefundRepository');
const { InMemoryWorkOrderRepository } = require('../../../packages/adapters/inmemory/InMemoryWorkOrderRepository');
const { InMemoryWorkOrderMessageRepository } = require('../../../packages/adapters/inmemory/InMemoryWorkOrderMessageRepository');
const { InMemoryProfitSharingRepository } = require('../../../packages/adapters/inmemory/InMemoryProfitSharingRepository');
const { FixedClockAdapter } = require('../../../packages/adapters/time/FixedClockAdapter');
const { SequenceIdGeneratorAdapter } = require('../../../packages/adapters/inmemory/SequenceIdGeneratorAdapter');
const { MockPaymentGateway } = require('../../../packages/adapters/inmemory/MockPaymentGateway');
const { verifyChain } = require('../../../packages/domain/audit/AuditChain');

const NOW = 1_760_000_000_000;
const DATE = '2025-10-09';

const ADDRESS = {
  province: '廣東省',
  city: '深圳市',
  district: '寶安區',
  street: '沙井街道',
  detailAddress: '中心路 28 號',
};

function dateKey(now) {
  const shifted = new Date(now + 480 * 60_000);
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, '0')}-${String(
    shifted.getUTCDate(),
  ).padStart(2, '0')}`;
}

async function buildWorld() {
  const orderRepository = new InMemoryOrderRepository();
  const productRepository = new InMemoryProductRepository();
  const serviceRepository = new InMemoryServiceRepository();
  const customerRepository = new InMemoryCustomerRepository();
  const csAgentRepository = new InMemoryCsAgentRepository();
  const technicianRepository = new InMemoryTechnicianRepository();
  const auditLogRepository = new InMemoryAuditLogRepository();
  const idSequence = new InMemoryIdSequenceRepository();
  const paymentRepository = new InMemoryPaymentRepository();
  const refundRepository = new InMemoryRefundRepository();
  const workOrderRepository = new InMemoryWorkOrderRepository();
  const workOrderMessageRepository = new InMemoryWorkOrderMessageRepository();
  const profitSharingRepository = new InMemoryProfitSharingRepository();
  const clock = new FixedClockAdapter(NOW);
  const idGenerator = new SequenceIdGeneratorAdapter({ idSequence, clock });
  const paymentGateway = new MockPaymentGateway();

  await productRepository.save({
    productId: 'prd-1',
    name: '冷媒 R410',
    priceCents: 2500,
    stock: 20,
    images: ['p1.png'],
    specs: [{ specId: 'size', title: '規格', values: ['標準罐', '大罐'] }],
    skus: [
      { skuId: 'sku-std', specValues: ['標準罐'], priceCents: 2500, stock: 20 },
      { skuId: 'sku-big', specValues: ['大罐'], priceCents: 4800, stock: 8 },
    ],
    isActive: true,
  });
  await productRepository.save({
    productId: 'prd-2',
    name: '排水管接頭',
    priceCents: 800,
    stock: 3,
    images: [],
    specs: [],
    skus: [],
    isActive: true,
  });
  await serviceRepository.save({
    serviceId: 'svc-1',
    name: '冷氣維修',
    priceCents: 10000,
    durationMinutes: 60,
    skillTags: ['空調'],
    images: ['s1.png'],
    isActive: true,
  });
  await customerRepository.save({
    customerId: 'cust-1',
    userId: 'user-cust-1',
    name: '王小明',
    phone: '13812345678',
  });
  await csAgentRepository.save({
    csAgentId: 'cs-1',
    userId: 'user-cs-1',
    employeeNo: 'E001',
    name: '客服一號',
    regions: ['*'],
    status: 'active',
    dailyRefundBudget: { date: dateKey(NOW), usedCents: 0, limitCents: 100000 },
  });
  await technicianRepository.save({
    technicianId: 'tech-1',
    userId: 'user-tech-1',
    name: '師傅一號',
    status: 'approved',
    skillTags: ['空調'],
  });

  const customer = { id: 'user-cust-1', role: 'customer', customerId: 'cust-1' };
  const technician = { id: 'user-tech-1', role: 'technician', technicianId: 'tech-1' };
  const csAgent = {
    id: 'user-cs-1',
    role: 'cs_agent',
    csAgentId: 'cs-1',
    regions: ['*'],
    dailyRefundBudget: { date: dateKey(NOW), usedCents: 0, limitCents: 100000 },
  };
  const admin = { id: 'admin-1', role: 'admin', permissions: ['admin.full'] };
  const otherCustomer = { id: 'user-other', role: 'customer', customerId: 'cust-2' };

  const deps = {
    orderRepository,
    productRepository,
    serviceRepository,
    customerRepository,
    csAgentRepository,
    technicianRepository,
    auditLogRepository,
    idGenerator,
    clock,
    paymentRepository,
    paymentGateway,
    refundRepository,
    workOrderRepository,
    workOrderMessageRepository,
    profitSharingRepository,
  };

  return {
    ...deps,
    actors: { customer, technician, csAgent, admin, otherCustomer },
    createOrder: new CreateOrderUseCase(deps),
    payOrder: new PayOrderUseCase(deps),
    assignOrder: new AssignOrderUseCase(deps),
    acceptOrder: new AcceptOrderUseCase(deps),
    completeOrder: new CompleteOrderUseCase(deps),
    approveCompletion: new ApproveCompletionUseCase(deps),
    requestRefund: new RequestRefundUseCase(deps),
    approveRefund: new ApproveRefundUseCase(deps),
    executeProfitSharing: new ExecuteProfitSharingUseCase(deps),
  };
}

async function createPaidOrder(world, items) {
  const created = await world.createOrder.execute({
    actor: world.actors.customer,
    items,
    address: ADDRESS,
    appointmentAt: NOW + 86_400_000,
  });
  assert.equal(created.ok, true, JSON.stringify(created.error));
  const orderId = created.value.orderId;

  const paid = await world.payOrder.execute({ actor: world.actors.customer, orderId });
  assert.equal(paid.ok, true, JSON.stringify(paid.error));
  return orderId;
}

async function runToCompleted(world, items) {
  const orderId = await createPaidOrder(world, items);

  assert.equal((await world.assignOrder.execute({ actor: world.actors.csAgent, orderId, technicianId: 'tech-1' })).ok, true);
  assert.equal((await world.acceptOrder.execute({ actor: world.actors.technician, orderId })).ok, true);
  assert.equal((await world.completeOrder.execute({ actor: world.actors.technician, orderId })).ok, true);
  assert.equal((await world.approveCompletion.execute({ actor: world.actors.customer, orderId })).ok, true);

  return orderId;
}

test('P5 整合：完整訂單生命週期＋稽核＋工單', async (t) => {
  await t.test('建立→支付→派單→接單→完工→驗收→分帳', async () => {
    const world = await buildWorld();
    const orderId = await runToCompleted(world, [
      { itemType: 'product', itemId: 'prd-1', skuId: 'sku-big', quantity: 1 },
      { itemType: 'service', itemId: 'svc-1', quantity: 1 },
    ]);

    const order = await world.orderRepository.findById(orderId);
    assert.equal(order.statusKey, 'COMPLETED');
    assert.equal(order.amounts.total.cents, 14800);

    // 支付紀錄與工單
    assert.equal((await world.paymentRepository.listByOrderId(orderId)).length, 1);
    const ticket = await world.workOrderRepository.findByOrderId(orderId);
    assert.ok(ticket);
    assert.ok((await world.workOrderMessageRepository.listByTicketId(ticket.ticketId)).length >= 4);

    // 稽核鏈
    const chain = await world.auditLogRepository.listByChain(`order:${orderId}`);
    assert.ok(chain.length >= 6);
    assert.deepEqual(verifyChain(chain), { ok: true, brokenAtSeq: null, reason: null });

    // 分帳
    const sharing = await world.executeProfitSharing.execute({
      actor: world.actors.admin,
      orderId,
    });
    assert.equal(sharing.ok, true, JSON.stringify(sharing.error));
    assert.equal(sharing.value.technicianShareCents, 8000);
    assert.equal((await world.profitSharingRepository.listByOrderId(orderId)).length, 1);

    // 退款（小額）
    const requested = await world.requestRefund.execute({
      actor: world.actors.customer,
      orderId,
      amountCents: 5000,
      reason: '服務不符',
    });
    assert.equal(requested.ok, true, JSON.stringify(requested.error));

    const approved = await world.approveRefund.execute({
      actor: world.actors.csAgent,
      refundId: requested.value.refundId,
    });
    assert.equal(approved.ok, true, JSON.stringify(approved.error));
    assert.equal(approved.value.status, 'refunded');

    const budget = await world.csAgentRepository.findById('cs-1');
    assert.equal(budget.dailyRefundBudget.usedCents, 5000);
  });

  await t.test('⚠️ 庫存不足 → 拒絕建立', async () => {
    const world = await buildWorld();
    const result = await world.createOrder.execute({
      actor: world.actors.customer,
      items: [{ itemType: 'product', itemId: 'prd-2', quantity: 4 }],
      address: ADDRESS,
    });
    assert.equal(result.ok, false);
    assert.equal(result.code, 'PRECONDITION_FAILED');
  });

  await t.test('⚠️ 他人不能支付 → FORBIDDEN', async () => {
    const world = await buildWorld();
    const created = await world.createOrder.execute({
      actor: world.actors.customer,
      items: [{ itemType: 'service', itemId: 'svc-1', quantity: 1 }],
      address: ADDRESS,
    });
    const result = await world.payOrder.execute({
      actor: world.actors.otherCustomer,
      orderId: created.value.orderId,
    });
    assert.equal(result.code, 'FORBIDDEN');
  });

  await t.test('⚠️ 重複支付 → PRECONDITION_FAILED', async () => {
    const world = await buildWorld();
    const orderId = await createPaidOrder(world, [
      { itemType: 'service', itemId: 'svc-1', quantity: 1 },
    ]);
    const result = await world.payOrder.execute({ actor: world.actors.customer, orderId });
    assert.equal(result.code, 'PRECONDITION_FAILED');
  });

  await t.test('⚠️ 支付失敗 → UPSTREAM_FAILED，訂單維持待付款', async () => {
    const world = await buildWorld();
    const created = await world.createOrder.execute({
      actor: world.actors.customer,
      items: [{ itemType: 'service', itemId: 'svc-1', quantity: 1 }],
      address: ADDRESS,
    });
    world.paymentGateway.failNext('createPayment');
    const result = await world.payOrder.execute({
      actor: world.actors.customer,
      orderId: created.value.orderId,
    });
    assert.equal(result.code, 'UPSTREAM_FAILED');
    const order = await world.orderRepository.findById(created.value.orderId);
    assert.equal(order.statusKey, 'PENDING_PAYMENT');
  });

  await t.test('⚠️ 非指派師傅不能接單 → FORBIDDEN', async () => {
    const world = await buildWorld();
    const orderId = await createPaidOrder(world, [
      { itemType: 'service', itemId: 'svc-1', quantity: 1 },
    ]);
    await world.assignOrder.execute({
      actor: world.actors.csAgent,
      orderId,
      technicianId: 'tech-1',
    });
    const result = await world.acceptOrder.execute({
      actor: { id: 'user-tech-2', role: 'technician', technicianId: 'tech-2' },
      orderId,
    });
    assert.equal(result.code, 'FORBIDDEN');
  });

  await t.test('⚠️ 大額退款：管理員自批 → SoD 拒絕', async () => {
    const world = await buildWorld();
    // 10 × 2500 = 25000 > 200 元門檻
    const orderId = await runToCompleted(world, [
      { itemType: 'product', itemId: 'prd-1', skuId: 'sku-std', quantity: 10 },
    ]);

    const requested = await world.requestRefund.execute({
      actor: world.actors.admin,
      orderId,
      amountCents: 25000,
      reason: '測試',
    });
    assert.equal(requested.ok, true, JSON.stringify(requested.error));

    const approved = await world.approveRefund.execute({
      actor: world.actors.admin,
      refundId: requested.value.refundId,
    });
    assert.equal(approved.code, 'FORBIDDEN');
    assert.equal(approved.error.details.reason, 'SOD_VIOLATION');
  });

  await t.test('⚠️ 未完成訂單不能分帳', async () => {
    const world = await buildWorld();
    const orderId = await createPaidOrder(world, [
      { itemType: 'service', itemId: 'svc-1', quantity: 1 },
    ]);
    const result = await world.executeProfitSharing.execute({
      actor: world.actors.admin,
      orderId,
    });
    assert.equal(result.code, 'PRECONDITION_FAILED');
  });
});
