'use strict';

const { validate } = require('./validate');
const { authenticate } = require('./authenticate');
const { toResponse } = require('./toResponse');
const { Result } = require('@repair/shared-kernel/Result');

/**
 * createRouter —— `event.action` 路由（P3／P5 雲函數入口）。
 *
 * 入口仍然只做四件事（docs/01 §1.6.4）：
 *   ① 參數校驗  ② 身分驗證  ③ 呼叫 use case  ④ 回傳結果
 *
 * 本 factory 把「同一個雲函數有多個 action」的樣板集中在一處：
 *
 * ```js
 * const routes = {
 *   'order.pay': { schema: { orderId: { type: 'string', required: true } }, UseCase: PayOrderUseCase },
 * };
 * exports.main = createRouter({ routes, container, getWxContext: cloud.getWXContext });
 * ```
 *
 * 設計約束與 `createHandler` 相同：
 *   - 不 require wx-server-sdk（getWxContext 由入口注入）
 *   - 不 new 任何 adapter（container 由 bootstrap 組裝）
 *   - 業務規則一律在 Use Case／domain，路由只做派送
 *
 * ⚠️ 安全順序：**先驗證 action 形狀 → 先驗身分 → 才查 action 是否存在**。
 *    未登入者不應該能枚舉有哪些 action。
 *
 * @param {object} options
 * @param {Object<string, { schema: object, UseCase: Function, rejectUnknown?: boolean }>} options.routes
 * @param {object} options.container
 * @param {Function} options.getWxContext
 * @param {object} [options.logger]
 * @returns {Function} exports.main
 */
function createRouter(options) {
  const { routes, container, getWxContext, logger } = options || {};

  if (!routes || typeof routes !== 'object') {
    throw new TypeError('createRouter 需要 routes 物件');
  }
  if (typeof getWxContext !== 'function') {
    throw new TypeError('createRouter 需要 getWxContext（由入口注入 cloud.getWXContext）');
  }
  if (!container || typeof container !== 'object') {
    throw new TypeError('createRouter 需要 container');
  }

  return async function main(event) {
    try {
      const input = isPlainEvent(event) ? event : {};
      const action = input.action;

      // ①' action 形狀（真正的參數校驗在確認 route 之後，才知道 schema）
      if (typeof action !== 'string' || action.length === 0) {
        return toResponse(Result.validation('缺少 action'));
      }

      // ② 身分驗證（先於 action 存在性，避免未登入者枚舉 action）
      const authResult = await authenticate(getWxContext(), container);
      if (!authResult.ok) return toResponse(authResult);
      const actor = authResult.value;

      const route = Object.prototype.hasOwnProperty.call(routes, action) ? routes[action] : null;
      if (!route) return toResponse(Result.notFound('未知的操作'));

      // ① 參數校驗（action 本身不屬於 payload；未知欄位預設拒絕）
      const payload = { ...input };
      delete payload.action;
      const inputResult = validate(payload, route.schema, {
        rejectUnknown: route.rejectUnknown !== false,
      });
      if (!inputResult.ok) return toResponse(inputResult);

      // ②' 角色校驗（只比對 Use Case 宣告，不含業務規則）
      const allowedRoles = Array.isArray(route.UseCase.allowedRoles) ? route.UseCase.allowedRoles : null;
      if (allowedRoles && !allowedRoles.includes(actor.role)) {
        return toResponse.forbidden();
      }

      // ③ 呼叫 use case
      const useCase = new route.UseCase(container);
      const result = await useCase.execute({
        ...inputResult.value,
        actor,
        openid: actor.openid,
      });

      // ④ 回傳結果
      return toResponse(result);
    } catch (err) {
      return toResponse.error(err, logger);
    }
  };
}

function isPlainEvent(event) {
  return event !== null && typeof event === 'object' && !Array.isArray(event);
}

module.exports = { createRouter };
