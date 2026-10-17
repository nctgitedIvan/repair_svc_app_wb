/**
 * 服務預約表單的純函式組裝（T3）。
 *
 * 為什麼不寫在頁面：
 *   日期時間解析、手機校驗、長度上限都是規則，頁面在 CI 裡跑不到。
 *   抽成純函式後，`tests/unit/frontend/appointment.test.js` 可以逐條驗證。
 *
 * ⚠️ 這裡只產生 **checkout payload 的純資料**；真正的領域驗證在
 *    `packages/domain/order/AppointmentInfo`（P5 的 CreateOrder 會再驗一次）。
 */

const phoneUtil = require('./phone.js');

const MAX_DESCRIPTION_LENGTH = 500;
const MAX_MEDIA_COUNT = 9;

/**
 * @param {object} args
 * @param {string} args.addressText 完整地址文字
 * @param {string} args.appointmentDate YYYY-MM-DD
 * @param {string} args.appointmentTime HH:mm
 * @param {string} args.contactName
 * @param {string} args.contactPhone
 * @param {string} [args.description]
 * @param {string[]} [args.mediaUrls]
 * @param {number} [args.now] 測試用；預設 Date.now()
 * @returns {{ info: object } | { error: string }}
 */
function buildAppointmentInfo({
  addressText,
  appointmentDate,
  appointmentTime,
  contactName,
  contactPhone,
  description = '',
  mediaUrls = [],
  now = Date.now(),
} = {}) {
  if (!addressText || typeof addressText !== 'string' || addressText.trim().length === 0) {
    return { error: '請選擇服務地址' };
  }
  if (!appointmentDate || !appointmentTime) {
    return { error: '請選擇預約時間' };
  }

  const appointmentAt = toTimestamp(appointmentDate, appointmentTime);
  if (!Number.isInteger(appointmentAt)) return { error: '預約時間格式不正確' };
  if (appointmentAt <= now) return { error: '預約時間必須在未來' };

  const name = typeof contactName === 'string' ? contactName.trim() : '';
  if (!name) return { error: '請輸入聯絡人姓名' };

  if (!phoneUtil.isValidPhone(contactPhone)) {
    return { error: '請輸入有效的手機號（+853／+86）' };
  }

  const text = typeof description === 'string' ? description.trim() : '';
  if (Array.from(text).length > MAX_DESCRIPTION_LENGTH) {
    return { error: `問題描述不得超過 ${MAX_DESCRIPTION_LENGTH} 字` };
  }

  const media = Array.isArray(mediaUrls) ? mediaUrls : [];
  if (media.length > MAX_MEDIA_COUNT) return { error: `附件最多 ${MAX_MEDIA_COUNT} 個` };
  if (media.some((url) => typeof url !== 'string' || url.length === 0)) {
    return { error: '附件格式不正確' };
  }

  return {
    info: {
      appointmentAt,
      address: addressText.trim(),
      contactName: name,
      contactPhone: contactPhone.trim(),
      description: text,
      mediaUrls: [...media],
    },
  };
}

/** `YYYY-MM-DD` + `HH:mm` → 本機時區 epoch ms；格式錯誤回 null */
function toTimestamp(dateText, timeText) {
  if (typeof dateText !== 'string' || typeof timeText !== 'string') return null;

  const dateParts = dateText.split('-').map(Number);
  const timeParts = timeText.split(':').map(Number);
  if (dateParts.length !== 3 || timeParts.length !== 2) return null;

  const [year, month, day] = dateParts;
  const [hour, minute] = timeParts;
  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    !Number.isInteger(day) ||
    !Number.isInteger(hour) ||
    !Number.isInteger(minute)
  ) {
    return null;
  }

  if (
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31 ||
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59
  ) {
    return null;
  }

  const value = new Date(year, month - 1, day, hour, minute, 0, 0);
  const timestamp = value.getTime();
  if (!Number.isInteger(timestamp)) return null;

  // 防呆：`new Date(2026, 1, 31)` 會自動變成 3 月，必須拒絕
  if (
    value.getFullYear() !== year ||
    value.getMonth() !== month - 1 ||
    value.getDate() !== day
  ) {
    return null;
  }

  return timestamp;
}

module.exports = { buildAppointmentInfo, toTimestamp, MAX_DESCRIPTION_LENGTH, MAX_MEDIA_COUNT };
