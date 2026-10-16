'use strict';

const { validate } = require('./validate');
const { authenticate } = require('./authenticate');
const { toResponse } = require('./toResponse');

/**
 * createHandler —— 把入口的四件事包成一個 factory。
 *
 * docs/01 §1.6.4 規定入口只做四件事：
 *   ① 參數校驗  ② 身分驗證  ③ 呼叫 use case  ④ 回傳結果
 *
 * 這個 factory 讓「遵守規則」變成預設值，而不是靠每個入口作者記得。
 * 入口檔案因此從數十行樣板縮成一次宣告。
 *
 * ⚠️ 設計約束：
 *   - 不 require wx-server-sdk。`getWxContext` 由入口注入 → 本模組可離線測試。
 *   - 不 new 任何 adapter。container 由 bootstrap 組裝後傳入（check-layering 會擋）。
 *
 * @param {object} options
 * @param {object} options.schema        參數 schema（見 validate.js）
 * @param {Function} options.UseCase     Use Case 類別（需有 static allowedRoles 與 execute）
 * @param {object} options.container     已組裝的依賴容器
 * @param {Function} options.getWxContext 回傳 wxContext 的函式（入口以 cloud.getWXContext 注入）
 * @param {object} [options.logger]      選填，用於記錄未預期例外
 * @param {boolean} [options.rejectUnknown=true] 是否拒絕 schema 未宣告的欄位
 * @returns {Function} 可直接作為 exports.main 的函式
 */
function createHandler(options) {
  const { schema, UseCase, container, getWxContext, logger, rejectUnknown = true } = options || {};

  if (!UseCase || typeof UseCase !== 'function') {
    throw new TypeError('createHandler 需要 UseCase 類別');
  }
  if (!schema || typeof schema !== 'object') {
    throw new TypeError('createHandler 需要 schema');
  }
  if (typeof getWxContext !== 'function') {
    throw new TypeError('createHandler 需要 getWxContext（由入口注入 cloud.getWXContext）');
  }
  if (!container || typeof container !== 'object') {
    throw new TypeError('createHandler 需要 container');
  }

  const allowedRoles = Array.isArray(UseCase.allowedRoles) ? UseCase.allowedRoles : null;

  return async function main(event) {
    try {
      // ① 參數校驗
      const inputResult = validate(event === undefined || event === null ? {} : event, schema, { rejectUnknown });
      if (!inputResult.ok) return toResponse(inputResult);

      // ② 身分驗證（第 1 層）
      const authResult = await authenticate(getWxContext(), container);
      if (!authResult.ok) return toResponse(authResult);
      const actor = authResult.value;

      // ②' 角色校驗（第 2 層）。只比對「這個 Use Case 允許哪些角色」，
      //     不含任何業務規則 —— 資源歸屬與狀態前提由 Use Case 內的
      //     AccessPolicy / domain 判斷（第 3 層）。
      if (allowedRoles && !allowedRoles.includes(actor.role)) {
        return toResponse.forbidden();
      }

      // ③ 呼叫 use case
      const useCase = new UseCase(container);
      const result = await useCase.execute({ actor, ...inputResult.value });

      // ④ 回傳結果
      return toResponse(result);
    } catch (err) {
      return toResponse.error(err, logger);
    }
  };
}

module.exports = { createHandler };
