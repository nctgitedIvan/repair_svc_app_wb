/**
 * 真實 API 實作 —— **P7b 才實作**。
 *
 * ⚠️ 這裡刻意**全部拋錯**而不是留空函式。
 *
 *    若留空（回傳 undefined），誤用時 UI 只會顯示空白，
 *    開發者會以為「還沒接好」而反覆找問題；
 *    拋出明確錯誤則會**當場指出「P7b 還沒做」**。
 *
 * `services/api/index.js` 依 `config.apiMode` 決定是否走這裡。
 * `scripts/check-frontend.js` 也會擋下頁面直接 import 本檔。
 */

const NOT_IMPLEMENTED = 'P7b 尚未實作：請將 config.apiMode 設為 "fake"，或等 P7b 完成';

function notImplemented(name) {
  return async function throwingStub() {
    throw new Error(`${name}：${NOT_IMPLEMENTED}`);
  };
}

export const getMyRole = notImplemented('getMyRole');
export const fetchHome = notImplemented('fetchHome');
export const fetchUserProfile = notImplemented('fetchUserProfile');
export const fetchCategories = notImplemented('fetchCategories');
export const fetchServices = notImplemented('fetchServices');
export const fetchServiceDetail = notImplemented('fetchServiceDetail');
export const fetchProducts = notImplemented('fetchProducts');
export const fetchProductDetail = notImplemented('fetchProductDetail');
export const fetchProductCatalogIndex = notImplemented('fetchProductCatalogIndex');
export const fetchMyOrders = notImplemented('fetchMyOrders');
export const fetchOrders = notImplemented('fetchOrders');
export const fetchOrderDetail = notImplemented('fetchOrderDetail');
export const fetchTechnicianTasks = notImplemented('fetchTechnicianTasks');
export const fetchTechnicianEarnings = notImplemented('fetchTechnicianEarnings');
export const fetchCsWorkbench = notImplemented('fetchCsWorkbench');
export const fetchWorkOrders = notImplemented('fetchWorkOrders');
export const fetchWorkOrderDetail = notImplemented('fetchWorkOrderDetail');
export const fetchAdminOverview = notImplemented('fetchAdminOverview');
