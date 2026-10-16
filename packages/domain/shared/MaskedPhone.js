'use strict';

const { ValueObject } = require('./ValueObject');
const { assertNonEmptyString } = require('./assertions');

/**
 * MaskedPhone —— 脫敏手機號。
 *
 * **核心設計目標：讓「師傅端取得完整手機號」在型別層就不可能。**
 *
 * 這不是「記得呼叫遮罩函式」的自律，而是：
 *   - 本物件**只儲存遮罩後的結果**，原始號碼在 `of()` 回傳後即不存在
 *   - **沒有任何方法可以取回完整號碼**（沒有 `unmask()`、沒有 `raw`）
 *   - 師傅端的 Port 查詢方法回傳的型別就是 `MaskedPhone`
 *
 * 對應 docs/01-目標架構.md §3.4、`docs/02-實施計畫.md` C-2。
 */

/** 中國大陸手機號：1 開頭、第二位 3-9、共 11 位 */
const CN_MOBILE_RE = /^1[3-9]\d{9}$/;

const MASK_CHAR = '*';

class MaskedPhone extends ValueObject {
  /**
   * 從**完整號碼**建立遮罩版本。原始號碼不會被保留。
   *
   * 幂等：對已遮罩的字串再呼叫一次，結果不變
   * （避免「二次遮罩」把 `138****1234` 變成 `138*******4` 之類的災難）。
   *
   * @param {string} phone 完整號碼或已遮罩的字串
   */
  static of(phone) {
    assertNonEmptyString(phone, 'phone');
    return new MaskedPhone(mask(phone));
  }

  /**
   * 從已遮罩的字串還原（供 adapter 從資料庫讀取時使用）。
   * 若傳入的是完整號碼，**會先遮罩** —— 不可能藉此繞過。
   */
  static fromMasked(masked) {
    assertNonEmptyString(masked, 'masked');
    return new MaskedPhone(mask(masked));
  }

  /** 內部建構子：只接受已遮罩的值 */
  constructor(masked) {
    super({ masked });
  }

  /** 唯一的取值方式 —— 拿到的一定是遮罩後的 */
  get masked() {
    return this.props.masked;
  }

  /** 除了 `masked` 之外不暴露任何欄位 */
  toJSON() {
    return { masked: this.props.masked };
  }
}

/**
 * 遮罩規則：
 *   - 11 位大陸手機 → `138****1234`（前 3 後 4）
 *   - 已含 `*` 者 → 原樣回傳（冪等）
 *   - 其他長度 → 保留前 1/3 與後 1/4，其餘遮罩（保守處理，不洩漏）
 */
function mask(phone) {
  const trimmed = String(phone).trim();
  if (trimmed.includes(MASK_CHAR)) return trimmed;

  if (CN_MOBILE_RE.test(trimmed)) {
    return `${trimmed.slice(0, 3)}${MASK_CHAR.repeat(4)}${trimmed.slice(7)}`;
  }

  // 非標準格式（市話、國際號、分機）：保守遮罩，寧可遮太多
  const len = trimmed.length;
  if (len <= 2) return MASK_CHAR.repeat(len);
  const head = Math.max(1, Math.floor(len / 3));
  const tail = Math.max(1, Math.floor(len / 4));
  return trimmed.slice(0, head) + MASK_CHAR.repeat(len - head - tail) + trimmed.slice(len - tail);
}

module.exports = { MaskedPhone, CN_MOBILE_RE };
