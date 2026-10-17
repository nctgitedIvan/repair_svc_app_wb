'use strict';

/**
 * customer-api —— 客戶端入口（event.action 路由）。
 *
 * 入口職責邊界（docs/01 §1.6.4）：只做
 *   ① 參數校驗  ② 身分驗證  ③ 呼叫 use case  ④ 回傳結果
 *
 * 路由表是本檔唯一的「知道有哪些 action」的地方；業務規則一律在
 * `packages/application` 的 Use Case 與 domain。
 *
 * ⛔ 不得出現業務規則：if 判斷訂單狀態、金額加減、for 迴圈處理業務資料。
 *
 * 健康檢查：不帶 `action` 的呼叫（例如雲端 console 測試 `{}`）仍回傳原本的
 * 服務資訊，方便部署驗證。
 */

const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

// require bootstrap 的副作用即執行 assertSharedBuild()（失敗則本函數無法啟動）
const { buildContainer, SERVICE } = require('./bootstrap');
const {
  AuthenticateUseCase,
  CreateOrderUseCase,
  PayOrderUseCase,
  RequestRefundUseCase,
  ApproveCompletionUseCase,
} = require('@repair/application');
const { createRouter } = require('@repair/entrypoint-kit');
const manifest = require('@repair/build-manifest');

const container = buildContainer();

/** 訂單識別碼的形狀（所有 action 共用） */
const ORDER_ID = { type: 'string', required: true, maxLength: 128 };

const ADDRESS = {
  type: 'object',
  required: true,
  validate: (value) =>
    ['province', 'city', 'district', 'detailAddress'].every(
      (key) => typeof value[key] === 'string' && value[key].length > 0,
    ) || '地址缺少 province／city／district／detailAddress',
};

/**
 * action → { schema, UseCase }
 *
 * | action | Use Case | 權限（由 AccessPolicy 判斷） |
 * |---|---|---|
 * | `auth.me` | AuthenticateUseCase | 已登入 |
 * | `order.create` | CreateOrderUseCase | customer |
 * | `order.pay` | PayOrderUseCase | 訂單本人 |
 * | `order.requestRefund` | RequestRefundUseCase | 訂單本人 |
 * | `order.confirmAcceptance` | ApproveCompletionUseCase | 訂單本人 |
 *
 * ⚠️ 查詢類 action（QueryMyOrders／ViewOrderDetail）尚未有 Use Case；
 *    P7b 之前不要用 `container.orderQuery` 直接塞進入口（入口只能呼叫 Use Case）。
 */
const routes = {
  'auth.me': {
    schema: {},
    UseCase: AuthenticateUseCase,
  },
  'order.create': {
    schema: {
      items: { type: 'array', required: true },
      address: ADDRESS,
      appointmentAt: { type: 'integer', required: false, min: 0 },
    },
    UseCase: CreateOrderUseCase,
  },
  'order.pay': {
    schema: { orderId: ORDER_ID },
    UseCase: PayOrderUseCase,
  },
  'order.requestRefund': {
    schema: {
      orderId: ORDER_ID,
      amountCents: { type: 'integer', required: true, min: 1 },
      reason: { type: 'string', required: false, maxLength: 200 },
    },
    UseCase: RequestRefundUseCase,
  },
  'order.confirmAcceptance': {
    schema: { orderId: ORDER_ID },
    UseCase: ApproveCompletionUseCase,
  },
};

const handle = createRouter({
  routes,
  container,
  getWxContext: () => cloud.getWXContext(),
  logger: container.logger,
});

/** 部署健康檢查（不帶 action 的呼叫） */
function health(event) {
  const capabilities = container.settlementGateway.capabilities();

  return {
    ok: true,
    service: SERVICE,
    sharedBuildHash: manifest.hash,
    runtime: {
      node: process.version,
      env: cloud.getWXContext().ENV || null,
      // 不洩漏 OPENID 本身，只回報「拿不拿得到」
      hasOpenid: Boolean(cloud.getWXContext().OPENID),
    },
    dependencies: {
      // P5-5 待辦：InMemory 不跨冷啟動，生產前須換 CloudDB
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
