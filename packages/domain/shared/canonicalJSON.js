'use strict';

/**
 * canonicalJSON —— 確定性序列化。
 *
 * 為什麼需要它：**哈希鏈的基礎**（`docs/P2-計畫.md` §A-2）。
 *
 * `JSON.stringify` 的鍵順序取決於「屬性被插入的順序」，
 * 同一筆語意相同的資料，若用不同方式建構，會產生**不同的字串** → **不同的 hash**。
 * 那會讓稽核鏈誤報斷點 —— 把「沒被篡改」誤判成「被篡改」。
 *
 * 本函式的保證：
 *   1. **鍵依字典序排序** → 與插入順序無關
 *   2. **無多餘空白** → 與格式化無關
 *   3. **數字保持數字型別** → 不轉字串（`1` 與 `"1"` 必須不同 hash）
 *   4. **`undefined` 的物件屬性被略過**（與 JSON.stringify 一致）
 *   5. 遇到無法確定的型別（function、symbol）**拋錯**，不靜默產生不穩定結果
 *
 * ⚠️ 刻意不支援 `Date` 物件：domain 不該持有非確定性的時間。
 *    若真有需要，請先轉成 Unix 毫秒整數再傳入。
 */

function canonicalJSON(value) {
  return stringify(value);
}

function stringify(value) {
  if (value === null) return 'null';

  const type = typeof value;
  if (type === 'number') {
    if (!Number.isFinite(value)) {
      throw new TypeError(`canonicalJSON 不接受非有限數字：${value}`);
    }
    // -0 與 0 在 JSON 中都是 "0"，統一處理避免平台差異
    return JSON.stringify(value === 0 ? 0 : value);
  }
  if (type === 'string') return JSON.stringify(value);
  if (type === 'boolean') return value ? 'true' : 'false';
  if (type === 'undefined') return 'null'; // 陣列內元素：與 JSON.stringify 一致

  if (type === 'function' || type === 'symbol' || type === 'bigint') {
    throw new TypeError(`canonicalJSON 不接受 ${type}（會產生不穩定的序列化結果）`);
  }

  if (Array.isArray(value)) {
    return `[${value.map(stringify).join(',')}]`;
  }

  if (type === 'object') {
    // ⚠️ Date 必須**先於** toJSON 檢查被擋下：
    // Date 自帶 toJSON()，若不特別處理會靜默產生 ISO 字串，
    // 造成「時間有兩種表示法」（Date 物件 vs Unix 毫秒整數），
    // 兩者的 hash 不同 → 稽核鏈會誤報斷點。
    // domain 一律以 Unix 毫秒整數表示時間（與 ClockPort 的契約一致）。
    if (value instanceof Date) {
      throw new TypeError(
        'canonicalJSON 不接受 Date 物件；請先轉為 Unix 毫秒整數' +
          '（domain 應以整數表示時間，見 docs/01 §2.1）',
      );
    }
    // 支援 toJSON（讓值物件能控制自己的序列化形狀）
    if (typeof value.toJSON === 'function') {
      return stringify(value.toJSON());
    }
    // 只接受純物件；class 實例若無 toJSON，其私有欄位不會出現在 here，
    // 序列化結果會遺漏狀態 —— 這是危險的，所以要擋。
    const proto = Object.getPrototypeOf(value);
    if (proto !== Object.prototype && proto !== null) {
      throw new TypeError(
        'canonicalJSON 只接受純物件或含 toJSON() 的物件；' +
          `收到 ${value.constructor ? value.constructor.name : '未知類別'}`,
      );
    }
    const keys = Object.keys(value)
      .filter((k) => value[k] !== undefined)
      .sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${stringify(value[k])}`).join(',')}}`;
  }

  throw new TypeError(`canonicalJSON 無法處理型別：${type}`);
}

module.exports = { canonicalJSON };
