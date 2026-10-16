'use strict';

/**
 * customer-api —— 客戶端入口（P1 骨架，僅健康檢查）。
 *
 * 入口職責邊界（docs/01 §1.6.4）：只做
 *   ① 參數校驗  ② 身分驗證  ③ 呼叫 use case  ④ 回傳結果
 * P1 尚無 Use Case，故只有健康檢查。P5 起改用 createHandler 宣告式寫法。
 *
 * ⛔ 不得出現業務規則：if 判斷訂單狀態、金額加減、for 迴圈處理業務資料。
 */

const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

// require bootstrap 的副作用即執行 assertSharedBuild()（失敗則本函數無法啟動）
const { buildContainer, SERVICE } = require('./bootstrap');
const manifest = require('@repair/build-manifest');

const container = buildContainer();

exports.main = async (event) => {
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
      // P1 全是 in-memory；P2 起會逐步顯示 CloudDB*
      adapters: 'in-memory',
      settlementMode: capabilities.settlementMode,
      supportsSharingReturn: capabilities.supportsSharingReturn,
    },
    receivedEvent: event === undefined ? null : event,
  };
};
