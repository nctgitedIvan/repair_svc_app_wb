'use strict';

const { Result } = require('@repair/shared-kernel/Result');
const { canExecuteProfitSharing } = require('@repair/domain/order/OrderStatus');
const { calculate } = require('@repair/domain/settlement/ProfitSharingPolicy');

/**
 * ComputeProfitShareUseCase —— 計算師傅報酬（唯讀，不觸發任何外部呼叫）。
 *
 * 決策依據（docs/01-目標架構.md §3.6）：
 *  - 分潤基數 = 服務費（不含材料費）
 *  - 比例讀**訂單快照**（`order.snapshot`），不讀當前配置 → 後台改比例不影響歷史訂單
 *  - 狀態為 DISPUTED／VOIDED 時拒絕（§3.3）
 *
 * ⚠️ 本 Use Case **只計算**，不呼叫分帳 API。
 *    真正的 ExecuteProfitSharing 於 P6 建立（A1 確認前不實作 adapter）。
 *
 * P4c：分潤計算已抽出至 `ProfitSharingPolicy` —— 基數規則**只有一份**。
 *      Use Case 只負責「編排」（檢查狀態前提、組 DTO）。
 */
class ComputeProfitShareUseCase {
  /**
   * ✅ constructor injection —— 不得在此 new 任何 adapter。
   * @param {{ orderRepository: object, clock: object, logger: object }} deps
   */
  constructor({ orderRepository, clock, logger }) {
    this.orderRepository = orderRepository;
    this.clock = clock;
    this.logger = logger;
  }

  /** 第 2 層校驗：角色。執行分帳計算是內部作業。 */
  static get allowedRoles() {
    return ['cs_agent', 'admin'];
  }

  async execute({ actor, orderId }) {
    const order = await this.orderRepository.findById(orderId);
    if (!order) {
      return Result.notFound(`訂單不存在：${orderId}`);
    }

    // ── domain 規則：狀態是否允許分帳（含 DISPUTED 與 VOIDED 的凍結）──
    // P4b 起 order.status 已是 OrderStatus 值物件，不需再從數字還原
    if (!canExecuteProfitSharing(order.status)) {
      return Result.preconditionFailed(
        `狀態「${order.status.label}」不可執行分帳`,
        { orderId, status: order.statusKey },
      );
    }

    // ── domain 計算：交給 ProfitSharingPolicy（基數規則只有一份）──
    const share = calculate({ order, terms: order.snapshot.profitSharingTerms });

    this.logger.info('profit share computed', {
      orderId,
      operator: actor.id,
      base: share.base.cents,
      technicianShare: share.technicianShare.cents,
    });

    // ✅ 回傳 DTO，不回傳實體（§1.6.3 硬規則 F2）
    return Result.ok({
      orderId,
      baseCents: share.base.cents,
      technicianShareCents: share.technicianShare.cents,
      platformShareCents: share.platformShare.cents,
      currency: share.currency,
      termsVersion: share.termsVersion,
      computedAt: this.clock.now(),
    });
  }
}

module.exports = { ComputeProfitShareUseCase };
