'use strict';

/**
 * authenticate —— ② 身分驗證（第 1 層校驗，docs/01 §8.2）。
 *
 * 職責邊界：**只回答「你是誰」，不回答「你能做什麼」。**
 * 角色能力是 domain 的 AccessPolicy 職責（§4.7），此處刻意不判斷角色 ——
 * 若在這裡寫 `if (role === 'admin')`，角色規則就會散落在入口層，無法被單測覆蓋。
 *
 * wxContext 由呼叫方傳入（`cloud.getWXContext()`），
 * 因此本模組**不需要** wx-server-sdk，可在本地完整測試。
 *
 * @param {{ OPENID?: string }} wxContext
 * @param {{ userRepository: object }} container
 * @returns {Promise<{ ok: true, value: object } | { ok: false, error: object }>}
 */
async function authenticate(wxContext, container) {
  if (!container || !container.userRepository) {
    throw new TypeError('authenticate 需要 container.userRepository');
  }

  const openid = wxContext && wxContext.OPENID;
  if (!openid || typeof openid !== 'string') {
    return { ok: false, error: { code: 'UNAUTHENTICATED', message: '無法取得身分識別', details: null } };
  }

  const user = await container.userRepository.findByOpenid(openid);
  if (!user) {
    // 不區分「openid 不存在」與「使用者未註冊」，避免成為使用者列舉的管道
    return { ok: false, error: { code: 'UNAUTHENTICATED', message: '無法取得身分識別', details: null } };
  }

  if (user.status !== 'active') {
    return { ok: false, error: { code: 'FORBIDDEN', message: '帳號已停用', details: null } };
  }

  // 客戶記錄的 id 不一定等於 users.id；OwnershipConstraint 需要 customers.customer_id。
  // 沒有注入 customerRepository 時（精簡測試）退回 null，約束會改用 actor.id。
  let customerId = null;
  if (user.roleType === 'customer' && container.customerRepository) {
    const customer = await container.customerRepository.findByUserId(user.id);
    customerId = customer ? customer.customerId : null;
  }

  // 客服的每日退款額度記錄在 cs_agents，不在 users。
  let csAgentId = null;
  if (user.roleType === 'cs_agent' && container.csAgentRepository) {
    const agent = await container.csAgentRepository.findByUserId(user.id);
    csAgentId = agent ? agent.csAgentId : null;
  }

  // actor：供 Use Case 與 AccessPolicy 使用的身分快照
  return {
    ok: true,
    value: {
      id: user.id,
      openid,
      role: user.roleType,
      // 多租戶預留：目前所有使用者都屬於平台
      merchantId: user.merchantId || 'platform',
      // 客戶專屬：OwnershipConstraint 的資源歸屬
      customerId,
      // 師傅專屬：資源歸屬約束（OwnershipConstraint）靠這個欄位
      technicianId: user.technicianId || null,
      // 客服專屬：RegionConstraint／每日退款額度用
      csAgentId,
      regions: Array.isArray(user.regions) ? user.regions : [],
      // AmountConstraint 用；由 Use Case 在需要時填入當日配額
      dailyRefundBudget: user.dailyRefundBudget || null,
      // admin 的權限來自權限組（docs/01 §4.8.4）
      permissions: Array.isArray(user.permissions) ? user.permissions : [],
    },
  };
}

module.exports = { authenticate };
