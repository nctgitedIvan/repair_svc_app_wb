'use strict';

/**
 * @repair/domain —— 領域層公開介面。
 *
 * 本層**不得**依賴任何外部世界（微信雲 SDK、資料庫、HTTP、系統時間）。
 * 由 scripts/check-layering.js 機械化保證。
 *
 * P0 階段僅建立狀態機（改造風險最高、也最該先做對的部分）。
 * 完整聚合（Order、OrderItem）與策略（ProfitSharingPolicy、AddressDisclosurePolicy…）
 * 於 P4 建立，見 docs/02-實施計畫.md §5。
 */

const OrderStatus = require('./order/OrderStatus');

module.exports = { OrderStatus };
