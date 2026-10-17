'use strict';

/**
 * @repair/application —— Use Cases。
 *
 * 方向：依賴 domain 與 ports。**不得**依賴 adapters（由 check-layering.js 檢查）。
 * P0 僅建立一個示範 Use Case；完整清單見 docs/01-目標架構.md §4。
 */

const { ComputeProfitShareUseCase } = require('./settlement/ComputeProfitShareUseCase');
const { AuthenticateUseCase } = require('./identity/AuthenticateUseCase');
const { authorize } = require('./access/authorize');
const { CreateOrderUseCase } = require('./order/CreateOrderUseCase');
const { PayOrderUseCase } = require('./order/PayOrderUseCase');
const { AssignOrderUseCase } = require('./order/AssignOrderUseCase');
const { AcceptOrderUseCase } = require('./order/AcceptOrderUseCase');
const { CompleteOrderUseCase } = require('./order/CompleteOrderUseCase');
const { ApproveCompletionUseCase } = require('./order/ApproveCompletionUseCase');
const { RequestRefundUseCase } = require('./order/RequestRefundUseCase');
const { ApproveRefundUseCase } = require('./order/ApproveRefundUseCase');
const { ExecuteProfitSharingUseCase } = require('./order/ExecuteProfitSharingUseCase');

module.exports = {
  ComputeProfitShareUseCase,
  AuthenticateUseCase,
  authorize,
  CreateOrderUseCase,
  PayOrderUseCase,
  AssignOrderUseCase,
  AcceptOrderUseCase,
  CompleteOrderUseCase,
  ApproveCompletionUseCase,
  RequestRefundUseCase,
  ApproveRefundUseCase,
  ExecuteProfitSharingUseCase,
};
