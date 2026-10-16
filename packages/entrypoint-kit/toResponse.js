'use strict';

/**
 * toResponse —— ④ 回傳統一格式（雲函數入口的職責之一）。
 *
 * 安全要求：**錯誤回應不得洩漏堆疊、內部訊息或資料庫細節。**
 * 內部錯誤一律折成通用訊息，細節寫進日誌（由呼叫方傳入的 logger 處理）。
 *
 * 回傳形狀刻意保持精簡：雲函數的回傳值會經過網路到前端，
 * 任何多餘欄位都是潛在的資訊洩漏面。
 */

/**
 * @param {{ ok: boolean, value?: any, error?: { code: string, message: string, details?: any } }} result
 * @returns {{ ok: true, data: any } | { ok: false, error: { code: string, message: string, details?: any } }}
 */
function toResponse(result) {
  if (result && result.ok) {
    return { ok: true, data: result.value === undefined ? null : result.value };
  }

  const error = (result && result.error) || { code: 'INTERNAL', message: '系統錯誤' };

  const payload = {
    ok: false,
    error: { code: error.code, message: error.message },
  };

  // 只有「校驗失敗」才回傳 details（欄位名與規則）。
  // 其他錯誤的 details 可能含內部識別碼或狀態，不回傳。
  if (error.code === 'VALIDATION' && error.details) {
    payload.error.details = error.details;
  }

  return payload;
}

/** 未登入 */
toResponse.unauthenticated = function unauthenticated(message = '請先登入') {
  return { ok: false, error: { code: 'UNAUTHENTICATED', message } };
};

/** 角色不足（第 2 層校驗失敗）。刻意與「資源不屬於你」用同一個訊息，避免探測。 */
toResponse.forbidden = function forbidden(message = '無權限執行此操作') {
  return { ok: false, error: { code: 'FORBIDDEN', message } };
};

/**
 * 未預期的例外。
 *
 * ⚠️ 這是唯一處理「程式錯誤」而非「業務失敗」的入口。
 * `err` 只用於日誌，**絕不進回應**。
 */
toResponse.error = function error(err, logger) {
  if (logger && typeof logger.error === 'function') {
    logger.error('unhandled entrypoint error', err, { stack: err && err.stack });
  }
  return {
    ok: false,
    error: {
      code: 'INTERNAL',
      message: '系統忙碌，請稍後再試',
    },
  };
};

module.exports = { toResponse };
