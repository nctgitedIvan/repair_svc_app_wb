'use strict';

/**
 * cs-api —— 客服端入口（event.action 路由）。
 *
 * 入口職責邊界（docs/01 §1.6.4）：只做
 *   ① 參數校驗  ② 身分驗證  ③ 呼叫 use case  ④ 回傳結果
 *
 * 客服權限層級高（可看完整客戶資料），但**授權仍由 AccessPolicy 判斷**；
 * 本檔不寫任何角色 if／狀態 if。
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
  RequestRefundUseCase,
  ApproveRefundUseCase,
  ComputeProfitShareUseCase,
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
 * | action | Use Case | 權限 |
 * |---|---|---|
 * | `auth.me` | AuthenticateUseCase | 已登入 |
 * | `order.assign` | AssignOrderUseCase | `orders.assign`（RegionConstraint） |
 * | `order.confirmCompletion` | ApproveCompletionUseCase | `orders.confirm_completion` |
 * | `order.requestRefund` | RequestRefundUseCase | `refunds.request`（代客戶發起） |
 * | `refund.approve` | ApproveRefundUseCase | 小額＝客服；大額＝管理員（SoD） |
 * | `settlement.computeProfitShare` | ComputeProfitShareUseCase | 唯讀計算 |
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
  'order.requestRefund': {
    schema: {
      orderId: ORDER_ID,
      amountCents: { type: 'integer', required: true, min: 1 },
      reason: { type: 'string', required: false, maxLength: 200 },
    },
    UseCase: RequestRefundUseCase,
  },
  'refund.approve': {
    schema: { refundId: REFUND_ID },
    UseCase: ApproveRefundUseCase,
  },
  'settlement.computeProfitShare': {
    schema: { orderId: ORDER_ID },
    UseCase: ComputeProfitShareUseCase,
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
