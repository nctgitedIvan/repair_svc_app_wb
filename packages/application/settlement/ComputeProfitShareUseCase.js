'use strict';

const { Result } = require('@repair/shared-kernel/Result');
const { Money, Rounding } = require('@repair/shared-kernel/Money');
const {
  OrderStatus,
  fromValue: orderStatusFromValue,
  canExecuteProfitSharing,
} = require('@repair/domain/order/OrderStatus');

/**
 * ComputeProfitShareUseCase —— 計算師傅報酬（唯讀，不觸發任何外部呼叫）。
 *
 * 決策依據（docs/01-目標架構.md §3.6）：
 *  - 分潤基數 = 服務費（不含材料費）
 *  - 比例讀**訂單快照**，不讀當前配置 → 後台改比例不影響歷史訂單
 *  - 狀態為 DISPUTED 時拒絕（§3.3「爭議中」凍結分帳）
 *
 * ⚠️ 注意：本 Use Case **只計算**，不呼叫分帳 API。
 *    真正的 ExecuteProfitSharing 於 P6 建立（A1 確認前不實作 adapter）。
 *
 * 本檔為 P0 管線驗證用，示範 §1.6.3 的依賴注入與 §1.7 第 3 項的驗收標準。
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

    // ── domain 規則：狀態是否允許分帳（含 DISPUTED 凍結）──
    const status = orderStatusFromValue(order.statusValue);
    if (!canExecuteProfitSharing(status)) {
      return Result.preconditionFailed(
        `狀態「${status.label}」不可執行分帳`,
        { orderId, status: status.key },
      );
    }

    // ── domain 計算：基數參數化 + 逐單快照 ──
    const terms = order.snapshot.profitSharingTerms;
    const base = terms.base === 'SERVICE_FEE_PLUS_MATERIAL'
      ? Money.fromCents(order.serviceFeeCents + order.materialFeeCents)
      : Money.fromCents(order.serviceFeeCents);

    const technicianShare = base.applyRate(terms.technicianRateBp, terms.roundingMode);
    // 平台份額＝基數減去師傅份額，確保兩者相加**恆等於**基數（不會因取整而漏錢）
    const platformShare = base.subtract(technicianShare);

    this.logger.info('profit share computed', {
      orderId,
      operator: actor.id,
      base: base.cents,
      technicianShare: technicianShare.cents,
    });

    // ✅ 回傳 DTO，不回傳實體（§1.6.3 硬規則 F2）
    return Result.ok({
      orderId,
      baseCents: base.cents,
      technicianShareCents: technicianShare.cents,
      platformShareCents: platformShare.cents,
      termsVersion: terms.termsVersion,
      computedAt: this.clock.now(),
    });
  }
}

// 匯出 Rounding 供測試引用，避免測試硬編碼字串
ComputeProfitShareUseCase.Rounding = Rounding;

module.exports = { ComputeProfitShareUseCase };
