'use strict';

const { ValueObject } = require('./ValueObject');
const { assertNonEmptyString } = require('./assertions');
const { PhoneNumber, CN_MOBILE_RE } = require('./PhoneNumber');

/**
 * MaskedPhone —— 脫敏手機號（支援澳門 853／大陸 86）。
 *
 * **核心設計目標：讓「師傅端取得完整手機號」在型別層就不可能。**
 *
 * - 本物件**只儲存遮罩後的結果**，原始號碼在 `of()` 回傳後即不存在
 * - **沒有任何方法可以取回完整號碼**
 *
 * 遮罩規則：
 * - 大陸（11 位）：`138 **** 5678`
 * - 澳門（8 位）：`853 66** ****`
 *
 * 對應 docs/01 §3.4、`docs/02-實施計畫.md` C-2。
 */
class MaskedPhone extends ValueObject {
  /**
   * 從完整號碼建立遮罩版本；已是遮罩字串則原樣回傳（冪等）。
   *
   * @param {string} phone 完整號碼或已遮罩字串
   */
  static of(phone) {
    assertNonEmptyString(phone, 'phone');
    const text = String(phone).trim();
    if (text.includes('*')) return new MaskedPhone(text);
    return new MaskedPhone(PhoneNumber.of(text).masked);
  }

  /**
   * 從已遮罩的字串還原（供 adapter 從資料庫讀取時使用）。
   * 若傳入的是完整號碼，**會先遮罩** —— 不可能藉此繞過。
   */
  static fromMasked(masked) {
    assertNonEmptyString(masked, 'masked');
    const text = String(masked).trim();
    if (text.includes('*')) return new MaskedPhone(text);
    return MaskedPhone.of(text);
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

module.exports = { MaskedPhone, CN_MOBILE_RE };
