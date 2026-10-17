'use strict';

/**
 * admin-api —— 管理端 JSON API（event.action 路由）。
 *
 * 入口職責邊界（docs/01 §1.6.4）：只做
 *   ① 參數校驗  ② 身分驗證  ③ 呼叫 use case  ④ 回傳結果
 *
 * ⚠️ 認證現況：本函數目前與其他入口共用 `authenticate()`（OPENID → users）。
 *    Web 後台**沒有 OPENID**，正式啟用前必須完成 P8-2 的獨立認證
 *    （scrypt／HttpOnly refresh cookie／CSRF／登入鎖定，docs/01 §4.8.3）。
 *    在那之前，本函數的 action 路由可以在小程序／雲端 console 以管理員帳號驗證。
 *
 * 健康檢查：不帶 `action` 的呼叫仍回傳服務資訊。
 */

const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const { buildContainer, SERVICE } = require('./bootstrap');
const {
  AuthenticateUseCase,
  AssignOrderUseCase,
  ApproveCompletionUseCase,
  ApproveRefundUseCase,
  ComputeProfitShareUseCase,
  ExecuteProfitSharingUseCase,
} = require('@repair/application');
const { createRouter } = require('@repair/entrypoint-kit');
const manifest = require('@repair/build-manifest');

const container = buildContainer();

const ORDER_ID = { type: 'string', required: true, maxLength: 128 };
const TECHNICIAN_ID = { type: 'string', required: true, maxLength: 128 };
const REFUND_ID = { type: 'string', required: true, maxLength: 128 };

/**
 * action → { schema, UseCase }
 *
 * | action | Use Case | 權限（admin 權限組） |
 * |---|---|---|
 * | `auth.me` | AuthenticateUseCase | 已登入 |
 * | `order.assign` | AssignOrderUseCase | `orders.assign` |
 * | `order.confirmCompletion` | ApproveCompletionUseCase | `orders.confirm_completion` |
 * | `refund.approve` | ApproveRefundUseCase | 大額退款（SoD：不得自批） |
 * | `settlement.computeProfitShare` | ComputeProfitShareUseCase | 唯讀計算 |
 * | `settlement.execute` | ExecuteProfitSharingUseCase | `settlement.execute` |
 *
 * ⚠️ 尚未有 Use Case 的後台 action（P8）：
 *    ManageService／ManageProduct／ManageTechnician／QueryDashboard／
 *    QueryAuditLogs／ManageUsers／RetryFailedSettlement。
 *    這些應先寫成 Use Case，再登錄到本表；入口不得直接操作 repository。
 */
const routes = {
  'auth.me': {
    schema: {},
    UseCase: AuthenticateUseCase,
  },
  'order.assign': {
    schema: { orderId: ORDER_ID, technicianId: TECHNICIAN_ID },
    UseCase: AssignOrderUseCase,
  },
  'order.confirmCompletion': {
    schema: { orderId: ORDER_ID },
    UseCase: ApproveCompletionUseCase,
  },
  'refund.approve': {
    schema: { refundId: REFUND_ID },
    UseCase: ApproveRefundUseCase,
  },
  'settlement.computeProfitShare': {
    schema: { orderId: ORDER_ID },
    UseCase: ComputeProfitShareUseCase,
  },
  'settlement.execute': {
    schema: { orderId: ORDER_ID },
    UseCase: ExecuteProfitSharingUseCase,
  },
};

const handle = createRouter({
  routes,
  container,
  getWxContext: () => cloud.getWXContext(),
  logger: container.logger,
});

function health(event) {
  const capabilities = container.settlementGateway.capabilities();

  return {
    ok: true,
    service: SERVICE,
    sharedBuildHash: manifest.hash,
    runtime: {
      node: process.version,
      env: cloud.getWXContext().ENV || null,
      hasOpenid: Boolean(cloud.getWXContext().OPENID),
    },
    dependencies: {
      adapters: 'in-memory',
      settlementMode: capabilities.settlementMode,
      supportsSharingReturn: capabilities.supportsSharingReturn,
    },
    actions: Object.keys(routes).sort(),
    receivedEvent: event === undefined ? null : event,
  };
}

exports.main = async (event) => {
  if (event === undefined || event === null || (typeof event === 'object' && Object.keys(event).length === 0)) {
    return health(event);
  }
  return handle(event);
};
