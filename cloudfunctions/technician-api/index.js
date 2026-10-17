'use strict';

/**
 * technician-api —— 師傅端入口。敏感資料隔離邊界（event.action 路由）。
 *
 * 入口職責邊界（docs/01 §1.6.4）：只做
 *   ① 參數校驗  ② 身分驗證  ③ 呼叫 use case  ④ 回傳結果
 *
 * ⛔ 不得出現業務規則：if 判斷訂單狀態、金額加減、for 迴圈處理業務資料。
 * ⛔ 不得 import 任何「回傳完整客戶資料」的 Use Case（docs/01 §5.3）。
 *
 * 健康檢查：不帶 `action` 的呼叫仍回傳服務資訊。
 */

const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const { buildContainer, SERVICE } = require('./bootstrap');
const {
  AuthenticateUseCase,
  AcceptOrderUseCase,
  CompleteOrderUseCase,
} = require('@repair/application');
const { createRouter } = require('@repair/entrypoint-kit');
const manifest = require('@repair/build-manifest');

const container = buildContainer();

const ORDER_ID = { type: 'string', required: true, maxLength: 128 };

/**
 * action → { schema, UseCase }
 *
 * | action | Use Case | 說明 |
 * |---|---|---|
 * | `auth.me` | AuthenticateUseCase | 已登入 |
 * | `order.accept` | AcceptOrderUseCase | 被指派本人接單 |
 * | `order.complete` | CompleteOrderUseCase | 完工回報；若尚未到場，Use Case 會先轉 IN_SERVICE |
 *
 * ⚠️ 尚未有 Use Case 的 action（P5-2 後續）：
 *    - `order.reject`（拒單）
 *    - `order.arrive`（到場打卡；目前摺在 complete 內）
 *    - `technician.earnings`（收益查詢）
 *    不要為了「湊路由」在入口直接呼叫 repository／orderQuery。
 */
const routes = {
  'auth.me': {
    schema: {},
    UseCase: AuthenticateUseCase,
  },
  'order.accept': {
    schema: { orderId: ORDER_ID },
    UseCase: AcceptOrderUseCase,
  },
  'order.complete': {
    schema: { orderId: ORDER_ID },
    UseCase: CompleteOrderUseCase,
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
