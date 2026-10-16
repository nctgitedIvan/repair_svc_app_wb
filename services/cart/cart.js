/**
 * ⚠️ **@deprecated（2026-10-16，P7a-2a T4）** —— 已無人呼叫，保留以供回滾。
 *
 * 這是改造前電商版的購物車資料來源（門店 → 促銷 → 商品三層結構）。
 * 維修版的購物車不走這裡：
 *
 * ```
 * utils/cart.js（本機 Storage，schema 對齊後端）
 *   + services/api 的 fetchProducts()（商品現況）
 *   → utils/cartView.js（純函式）
 *   → pages/cart/index.js
 * ```
 *
 * **不刪除**（紅線 7：不刪除現有功能）。若確認永久不需要，
 * 應在獨立階段連同 `model/cart.js` 一起移除。
 */

import { config } from '../../config/index';

/** 获取购物车mock数据 */
function mockFetchCartGroupData(params) {
  const { delay } = require('../_utils/delay');
  const { genCartGroupData } = require('../../model/cart');

  return delay().then(() => genCartGroupData(params));
}

/** 获取购物车数据 */
export function fetchCartGroupData(params) {
  if (config.useMock) {
    return mockFetchCartGroupData(params);
  }

  return new Promise((resolve) => {
    resolve('real api');
  });
}
