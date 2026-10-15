'use strict';

/**
 * @repair/adapters —— Ports 的實作。
 *
 * 本層是唯一允許接觸外部世界的層（微信雲 SDK、微信支付 API、HTTP、系統時間）。
 * 鐵律（docs/01-目標架構.md §1.6.5）：**只做翻譯，零業務規則**。
 *   - 不得做金額計算
 *   - 不得決定狀態流轉
 *   - 不得計算分潤比例
 * 判準：把 adapter 換成 in-memory fake，業務行為必須完全不變。
 *
 * ⛔ A1 確認前禁止實作：WeChatPayApiV3Adapter、CloudPayProfitSharingAdapter、
 *    WeChatProfitSharingSettlementAdapter、PlatformEscrowSettlementAdapter
 *    （見 docs/01-目標架構.md §9.0）
 */

const { SystemClockAdapter } = require('./time/SystemClockAdapter');
const { FixedClockAdapter } = require('./time/FixedClockAdapter');
const { InMemoryLoggerAdapter } = require('./logging/InMemoryLoggerAdapter');
const { InMemoryOrderRepository } = require('./inmemory/InMemoryOrderRepository');

module.exports = {
  SystemClockAdapter,
  FixedClockAdapter,
  InMemoryLoggerAdapter,
  InMemoryOrderRepository,
};
