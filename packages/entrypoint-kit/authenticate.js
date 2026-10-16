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

  // actor：供 Use Case 與 AccessPolicy 使用的身分快照
  return {
    ok: true,
    value: {
      id: user.id,
      openid,
      role: user.roleType,
      // 師傅專屬：資源歸屬約束（OwnershipConstraint）靠這個欄位
      technicianId: user.technicianId || null,
      // 客服專屬：RegionConstraint 用
      regions: Array.isArray(user.regions) ? user.regions : [],
      // AmountConstraint 用；由 Use Case 在需要時填入當日配額
      dailyRefundBudget: user.dailyRefundBudget || null,
    },
  };
}

module.exports = { authenticate };
