'use strict';

/**
 * @repair/application —— Use Cases。
 *
 * 方向：依賴 domain 與 ports。**不得**依賴 adapters（由 check-layering.js 檢查）。
 * P0 僅建立一個示範 Use Case；完整清單見 docs/01-目標架構.md §4。
 */

const { ComputeProfitShareUseCase } = require('./settlement/ComputeProfitShareUseCase');

module.exports = { ComputeProfitShareUseCase };
