/**
 * API 入口 —— 頁面**只能**透過本檔取資料。
 *
 * 依 `config.apiMode` 切換實作：
 *   - `'fake'`  → `./_fake`（P7a：記憶體假資料，讓 UI 在 P5 之前可開發）
 *   - `'cloud'` → `./real`（P7b：呼叫雲函數）
 *
 * **頁面不得直接 import `_fake` 或 `real`** —— 由 `scripts/check-frontend.js` 擋下。
 * 這樣 P7b 換實作時，UI 完全不用改。
 */

import { config } from '../../config/index';
import * as fake from './_fake/index';
import * as real from './real/index';

const impl = config.apiMode === 'cloud' ? real : fake;

// 逐個轉出，而非 `export * from` —— 這樣契約一目了然，也方便靜態檢查。
export const getMyRole = (...args) => impl.getMyRole(...args);
export const fetchServices = (...args) => impl.fetchServices(...args);
export const fetchServiceDetail = (...args) => impl.fetchServiceDetail(...args);
export const fetchProducts = (...args) => impl.fetchProducts(...args);
export const fetchProductDetail = (...args) => impl.fetchProductDetail(...args);
export const fetchProductCatalogIndex = (...args) => impl.fetchProductCatalogIndex(...args);
export const fetchMyOrders = (...args) => impl.fetchMyOrders(...args);
export const fetchOrderDetail = (...args) => impl.fetchOrderDetail(...args);
export const fetchTechnicianTasks = (...args) => impl.fetchTechnicianTasks(...args);
export const fetchTechnicianEarnings = (...args) => impl.fetchTechnicianEarnings(...args);
export const fetchCsWorkbench = (...args) => impl.fetchCsWorkbench(...args);
export const fetchWorkOrders = (...args) => impl.fetchWorkOrders(...args);
export const fetchWorkOrderDetail = (...args) => impl.fetchWorkOrderDetail(...args);
export const fetchAdminOverview = (...args) => impl.fetchAdminOverview(...args);
