/**
 * roleRouter —— 依角色決定首頁。
 *
 * ⚠️ **這是體驗優化，不是安全邊界。**
 *    即使有人繞過前端直接呼叫雲函數，`entrypoint` 的 `authenticate()` 仍會擋下。
 *    判準：**把前端全刪掉，系統仍必須安全。**
 *
 * ⚠️ **本檔刻意使用 CommonJS（`module.exports`）而非 ESM。**
 *    原因：這樣 `homePathForRole` 才能被 `node:test` 直接 require 做單元測試。
 *    小程式原生支援 CommonJS，不影響運行。
 *    （其餘前端檔案仍用 ESM；這是刻意的局部例外，換來可測試性。）
 */

/** 角色 → 首頁路徑。單一真實來源。 */
const ROLE_HOME = Object.freeze({
  customer: '/pages/home/home',
  technician: '/pages/technician/index/index',
  cs_agent: '/pages/cs/index/index',
  admin: '/pages/admin/overview/index',
});

const FALLBACK_ROLE = 'customer';

/**
 * 取得該角色的首頁路徑。
 *
 * @param {string} role `customer` | `technician` | `cs_agent` | `admin`
 * @returns {string} 以 `/` 開頭的絕對路徑（`reLaunch` 需要）
 */
function homePathForRole(role) {
  return ROLE_HOME[role] || ROLE_HOME[FALLBACK_ROLE];
}

/** 該角色是否為已知角色 */
function isKnownRole(role) {
  return Object.prototype.hasOwnProperty.call(ROLE_HOME, role);
}

/** 已知角色清單 */
function knownRoles() {
  return Object.keys(ROLE_HOME);
}

/**
 * 執行分發（有副作用，故與純函式分開）。
 *
 * @param {string} role
 * @returns {string} 實際導向的路徑
 */
function dispatch(role) {
  const url = homePathForRole(role);
  wx.reLaunch({ url });
  return url;
}

/**
 * 登入後的分發流程：取得角色 → 導向首頁。
 *
 * ⚠️ 角色**只能**由後端決定（`getMyRole` 用 OPENID 查 `users`）。
 *    前端不得自行推斷或快取後改寫。
 *
 * @param {() => Promise<{ role: string }>} getMyRole
 */
async function dispatchAfterLogin(getMyRole) {
  const { role } = await getMyRole();
  return dispatch(role);
}

module.exports = {
  ROLE_HOME,
  FALLBACK_ROLE,
  homePathForRole,
  isKnownRole,
  knownRoles,
  dispatch,
  dispatchAfterLogin,
};
