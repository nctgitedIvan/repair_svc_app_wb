'use strict';

const { canonicalJSON } = require('./canonicalJSON');
const { assertPlainObject } = require('./assertions');

/**
 * ValueObject —— 值物件基底。
 *
 * 值物件的定義性質：
 *   1. **不可變**：建立後不得修改（本類別會 freeze 內部 props）
 *   2. **以值比較**：兩者相等若且唯若所有欄位相等（`equals()`）
 *   3. **無識別性**：沒有 id；`Money(100)` 與另一個 `Money(100)` 是同一個概念
 *
 * 子類別用法：
 * ```js
 * class OrderNo extends ValueObject {
 *   constructor(value) {
 *     assertNonEmptyString(value, 'OrderNo');
 *     super({ value });
 *   }
 *   get value() { return this.props.value; }
 *   toJSON() { return { value: this.props.value }; }   // 供 canonicalJSON 使用
 * }
 * ```
 *
 * ⚠️ **子類別必須覆寫 `toJSON()`**，否則 `canonicalJSON` 會因無法取得私有狀態而拋錯。
 *    這是刻意的設計：寧可大聲失敗，也不要產生「看起來對但少了欄位」的 hash。
 *
 * ⚠️ **子類別不得在建構子中賦予「公開屬性」**。
 *    本類別在 `super()` 期間就 `Object.freeze(this)`，因此：
 *    - ✅ 私有欄位（`#x = ...`）**可以**正常初始化（私有欄位不走 property 機制）
 *    - ❌ `this.someField = x`（公開屬性）會拋 `TypeError: object is not extensible`
 *
 *    這是**刻意的**：它強迫所有狀態放進 `#props` 或私有欄位，
 *    避免出現「一半在 props、一半在公開屬性」的值物件 —— 那種物件的 `equals()` 必然出錯。
 *
 * ⚠️ **`toJSON()` 只能依賴 `this.props`，不得讀取子類別的私有欄位。**
 *
 *    原因：本類別在 `super()` 期間就呼叫 `this.toJSON()` 來預算雜湊，
 *    而子類別的私有欄位（`#x`）要到 `super()` **回傳後**才初始化。
 *    若 `toJSON()` 讀取 `#x`，會拋
 *    `TypeError: Cannot read private member #x from an object whose class did not declare it`。
 *
 *    這是實測踩到的坑（P4a-T4 的 `MaskedPhone`，原本把遮罩值同時存在 `#masked` 與 props）。
 *    **正解：狀態只放 `props`，不要另外複製到私有欄位** —— 兩份來源必然走鐘。
 */
class ValueObject {
  #props;
  #frozenKey;

  constructor(props) {
    assertPlainObject(props, `${this.constructor.name} 的 props`);
    // 深拷貝後凍結，避免外部持有參照後改動
    this.#props = deepFreeze(clonePlain(props));
    // 預先算好鍵值，讓 equals 的錯誤訊息更清楚
    this.#frozenKey = canonicalJSON(this.toJSON());
    Object.freeze(this);
  }

  /** 供子類別存取欄位。回傳的是已凍結的物件。 */
  get props() {
    return this.#props;
  }

  /**
   * 以值比較。**同時比對型別** —— `OrderNo('A')` 不等於 `SomeOtherVO('A')`。
   */
  equals(other) {
    if (other === this) return true;
    if (!(other instanceof ValueObject)) return false;
    if (other.constructor !== this.constructor) return false;
    return this.#frozenKey === canonicalJSON(other.toJSON());
  }

  /** 穩定且可讀的表示，供日誌與錯誤訊息使用 */
  toString() {
    return `${this.constructor.name}(${this.#frozenKey})`;
  }

  /**
   * 供 `canonicalJSON` 與 `equals` 使用。
   * 預設回傳 props —— 但子類別**應該覆寫**以控制序列化形狀。
   */
  toJSON() {
    return this.#props;
  }
}

/** 只複製純物件／陣列／原始型別 */
function clonePlain(value) {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(clonePlain);
  const out = {};
  for (const key of Object.keys(value)) {
    out[key] = clonePlain(value[key]);
  }
  return out;
}

function deepFreeze(value) {
  if (value === null || typeof value !== 'object') return value;
  Object.freeze(value);
  for (const key of Object.keys(value)) {
    deepFreeze(value[key]);
  }
  return value;
}

module.exports = { ValueObject };
