'use strict';

const { Result } = require('@repair/shared-kernel/Result');
const { Money, Rounding } = require('@repair/shared-kernel/Money');
const { Order, MAX_ORDER_ITEMS } = require('@repair/domain/order/Order');
const { OrderItem, ItemType, FeeType } = require('@repair/domain/order/OrderItem');
const { OrderSnapshot } = require('@repair/domain/order/OrderSnapshot');
const { Address } = require('@repair/domain/shared/Address');
const { OrderNo } = require('@repair/domain/shared/OrderNo');
const { ProfitSharingTerms, SharingBase } = require('@repair/domain/settlement/ProfitSharingTerms');
const { Permission } = require('@repair/domain/access/Permission');
const { authorize } = require('../access/authorize');
const { appendOrderAudit } = require('../shared/audit');
const { toOrderDto } = require('../shared/orderDto');

const DEFAULT_PROFIT_TERMS = {
  base: SharingBase.SERVICE_FEE,
  technicianRateBp: 8000,
  platformRateBp: 2000,
  roundingMode: Rounding.FLOOR_TO_CENT,
  termsVersion: 'v1',
};

/**
 * CreateOrderUseCase —— 建立待支付訂單（P5）。
 *
 * 規則：
 * - 先過 AccessPolicy（`orders.create`）
 * - 庫存**只檢查、不扣減**（扣減在支付成功時，§3.7.4）
 * - 金額由 `Order.create()` 內的 `PricingService` 計算，不接受前端傳總額
 * - 明細上限 50（`Order.MAX_ORDER_ITEMS`，雲開發事務限制）
 */
class CreateOrderUseCase {
  constructor({
    orderRepository,
    productRepository,
    serviceRepository,
    customerRepository,
    systemConfigRepository,
    auditLogRepository,
    idGenerator,
    clock,
  }) {
    if (!orderRepository) throw new TypeError('CreateOrderUseCase 需要 orderRepository');
    if (!productRepository) throw new TypeError('CreateOrderUseCase 需要 productRepository');
    if (!serviceRepository) throw new TypeError('CreateOrderUseCase 需要 serviceRepository');
    if (!idGenerator) throw new TypeError('CreateOrderUseCase 需要 idGenerator');
    if (!clock) throw new TypeError('CreateOrderUseCase 需要 clock');

    this.orderRepository = orderRepository;
    this.productRepository = productRepository;
    this.serviceRepository = serviceRepository;
    this.customerRepository = customerRepository || null;
    this.systemConfigRepository = systemConfigRepository || null;
    this.auditLogRepository = auditLogRepository || null;
    this.idGenerator = idGenerator;
    this.clock = clock;
  }

  async execute({ actor, items, address, appointmentAt = null } = {}) {
    const denied = authorize(actor, Permission.ORDER_CREATE.key, {});
    if (denied) return denied;

    if (!Array.isArray(items) || items.length === 0) {
      return Result.validation('訂單至少要有一個明細');
    }
    if (items.length > MAX_ORDER_ITEMS) {
      return Result.validation(`訂單明細不得超過 ${MAX_ORDER_ITEMS} 筆`, {
        itemCount: items.length,
        max: MAX_ORDER_ITEMS,
      });
    }
    if (!address || typeof address !== 'object') {
      return Result.validation('缺少服務地址');
    }

    let customerId = actor.customerId || actor.id;
    if (this.customerRepository) {
      const customer = await this.customerRepository.findByUserId(actor.id);
      if (customer) customerId = customer.customerId;
    }

    const orderItems = [];
    for (const line of items) {
      const built = await this.#buildItem(line);
      if (built.isFailure) return built;
      orderItems.push(built.value);
    }

    const snapshotInfo = await this.#profitTerms();
    const now = this.clock.now();
    const orderNo = await this.idGenerator.nextOrderNo();
    const orderId = `order-${orderNo}`;

    const order = Order.create({
      orderId,
      orderNo: new OrderNo(orderNo),
      // 多租戶預留：目前 actor 都屬於平台；未來由目錄項目的 merchantId 決定
      merchantId: actor.merchantId || 'platform',
      customerId,
      items: orderItems,
      address: new Address(address),
      appointmentAt,
      snapshot: new OrderSnapshot({
        profitSharingTerms: new ProfitSharingTerms(snapshotInfo.terms),
        pricingVersion: snapshotInfo.pricingVersion,
      }),
      createdAt: now,
    });

    await this.orderRepository.save(order);
    await appendOrderAudit({
      auditLogRepository: this.auditLogRepository,
      orderId,
      actor,
      action: 'order.create',
      at: now,
      details: {
        itemCount: orderItems.length,
        totalCents: order.amounts.total.cents,
      },
    });

    return Result.ok(toOrderDto(order));
  }

  async #buildItem(line) {
    if (!line || !Number.isInteger(line.quantity) || line.quantity < 1) {
      return Result.validation('明細數量必須是正整數', { line });
    }

    if (line.itemType === ItemType.PRODUCT) {
      const product = await this.productRepository.findById(line.itemId);
      if (!product || product.isActive === false) {
        return Result.validation(`商品不存在或已下架：${line.itemId}`);
      }

      const hasSpecs = Array.isArray(product.specs) && product.specs.length > 0;
      if (hasSpecs) {
        const sku = (product.skus || []).find((entry) => entry.skuId === line.skuId);
        if (!sku) return Result.validation(`規格不存在：${line.skuId}`, { productId: product.productId });
        if (!Number.isInteger(sku.stock) || sku.stock < line.quantity) {
          return Result.preconditionFailed('庫存不足', {
            productId: product.productId,
            skuId: sku.skuId,
            requested: line.quantity,
            stock: sku.stock,
          });
        }
        return Result.ok(
          new OrderItem({
            itemType: ItemType.PRODUCT,
            itemRefId: product.productId,
            nameSnapshot: product.name,
            specSnapshot: (sku.specValues || []).join(' / '),
            unitPriceSnapshot: Money.fromCents(sku.priceCents, 'CNY'),
            quantity: line.quantity,
            feeType: FeeType.MATERIAL_FEE,
            commissionRateBpSnapshot: await this.#commissionRateBp(),
          }),
        );
      }

      if (!Number.isInteger(product.stock) || product.stock < line.quantity) {
        return Result.preconditionFailed('庫存不足', {
          productId: product.productId,
          requested: line.quantity,
          stock: product.stock,
        });
      }
      return Result.ok(
        new OrderItem({
          itemType: ItemType.PRODUCT,
          itemRefId: product.productId,
          nameSnapshot: product.name,
          specSnapshot: '',
          unitPriceSnapshot: Money.fromCents(product.priceCents, 'CNY'),
          quantity: line.quantity,
          feeType: FeeType.MATERIAL_FEE,
          commissionRateBpSnapshot: await this.#commissionRateBp(),
        }),
      );
    }

    if (line.itemType === ItemType.SERVICE) {
      if (line.quantity !== 1) return Result.validation('服務的數量必須是 1');
      const service = await this.serviceRepository.findById(line.itemId);
      if (!service || service.isActive === false) {
        return Result.validation(`服務不存在或已下架：${line.itemId}`);
      }
      return Result.ok(
        new OrderItem({
          itemType: ItemType.SERVICE,
          itemRefId: service.serviceId,
          nameSnapshot: service.name,
          specSnapshot: '',
          unitPriceSnapshot: Money.fromCents(service.priceCents, 'CNY'),
          quantity: 1,
          feeType: FeeType.SERVICE_FEE,
          commissionRateBpSnapshot: await this.#commissionRateBp(),
        }),
      );
    }

    return Result.validation(`未知的明細類型：${line.itemType}`);
  }

  async #commissionRateBp() {
    if (!this.systemConfigRepository) return 8000;
    const config = await this.systemConfigRepository.get('commission', { rateBp: 8000 });
    return config && Number.isInteger(config.rateBp) ? config.rateBp : 8000;
  }

  async #profitTerms() {
    if (!this.systemConfigRepository) {
      return { terms: DEFAULT_PROFIT_TERMS, pricingVersion: 'p5' };
    }
    const config = await this.systemConfigRepository.get('profit_sharing', null);
    if (!config) return { terms: DEFAULT_PROFIT_TERMS, pricingVersion: 'p5' };

    return {
      terms: {
        base: config.base || DEFAULT_PROFIT_TERMS.base,
        technicianRateBp: Number.isInteger(config.technicianRateBp)
          ? config.technicianRateBp
          : DEFAULT_PROFIT_TERMS.technicianRateBp,
        platformRateBp: Number.isInteger(config.platformRateBp)
          ? config.platformRateBp
          : DEFAULT_PROFIT_TERMS.platformRateBp,
        roundingMode: config.roundingMode || DEFAULT_PROFIT_TERMS.roundingMode,
        termsVersion: config.termsVersion || DEFAULT_PROFIT_TERMS.termsVersion,
      },
      pricingVersion: config.pricingVersion || 'p5',
    };
  }
}

module.exports = { CreateOrderUseCase, DEFAULT_PROFIT_TERMS };
