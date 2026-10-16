/**
 * roleVisibility —— 依角色決定「**顯示什麼**」。
 *
 * ⚠️⚠️ **這個檔案不是權限系統。**
 *
 *    它只用來避免使用者看到不屬於他的介面（體驗優化）。
 *    **後端不會因為這裡回傳 true 就放行任何操作** ——
 *    真正的判斷在 `packages/domain/access/AccessPolicy`。
 *
 *    判準：**把前端全刪掉，系統仍必須安全。**
 *    若某條規則刪掉前端就失效，那條規則寫錯地方了。
 *
 *    `scripts/check-frontend.js` 會擋下任何在 `pages/` 引用權限邏輯的企圖
 *    （`AccessPolicy`／`can(`／`permission`）。
 *
 * 與 `roleRouter.js` 相同，本檔刻意用 CommonJS 以便單元測試。
 */

const ROLES = Object.freeze({
  CUSTOMER: 'customer',
  TECHNICIAN: 'technician',
  CS_AGENT: 'cs_agent',
  ADMIN: 'admin',
});

const isCustomer = (role) => role === ROLES.CUSTOMER;
const isTechnician = (role) => role === ROLES.TECHNICIAN;
const isCsAgent = (role) => role === ROLES.CS_AGENT;
const isAdmin = (role) => role === ROLES.ADMIN;

/** 內部人員（客服或管理員）—— 可見完整客戶資料 */
const isStaff = (role) => isCsAgent(role) || isAdmin(role);

/**
 * 依角色過濾一組項目。
 *
 * @param {Array<{ id: string, roles: string[] }>} items
 * @param {string} role
 */
function visibleItems(items, role) {
  if (!Array.isArray(items)) return [];
  return items.filter((item) => Array.isArray(item.roles) && item.roles.includes(role));
}

module.exports = {
  ROLES,
  isCustomer,
  isTechnician,
  isCsAgent,
  isAdmin,
  isStaff,
  visibleItems,
};
