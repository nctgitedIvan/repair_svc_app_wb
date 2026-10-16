'use strict';

const { ValueObject } = require('./ValueObject');
const { invariant, assertOneOf } = require('./assertions');

/**
 * AddressView —— **分級揭露後**的地址。
 *
 * 與 `MaskedPhone` 同一思路：**讓「拿到不該看的地址」在型別層就不可能。**
 *
 * 關鍵不變式：**`level === 'DISTRICT'` 時，`detailAddress` 必須為 null。**
 * 因此師傅端在服務當日 08:00 之前，即使直接讀取 `view.detailAddress`
 * 也只會拿到 `null` —— 不是靠前端不顯示。
 *
 * 對應 docs/01-目標架構.md §3.4。
 */

const DisclosureLevel = Object.freeze({
  /** 區域 + 街道（師傅接單後、服務當日 08:00 前） */
  DISTRICT: 'DISTRICT',
  /** 完整門牌（服務當日 08:00 起、或客服／管理員／客戶本人） */
  FULL: 'FULL',
});

const LEVELS = Object.freeze(Object.values(DisclosureLevel));

class AddressView extends ValueObject {
  /**
   * @param {object} props
   * @param {string} props.level          DisclosureLevel 之一
   * @param {string} props.province
   * @param {string} props.city
   * @param {string} props.district
   * @param {string} [props.street]
   * @param {string|null} [props.detailAddress] 只有 FULL 才允許有值
   */
  /**
   * 建立**區域級**視圖。
   *
   * 刻意**不接受** `detailAddress` 參數 —— 讓「把門牌放進區域級視圖」
   * 在呼叫層就寫不出來，而不是等到建構子才拋錯。
   *
   * @param {{ province: string, city: string, district: string, street?: string }} props
   */
  static district(props) {
    return new AddressView({ ...props, level: DisclosureLevel.DISTRICT, detailAddress: null });
  }

  /**
   * 建立**完整**視圖。只有客服、管理員、客戶本人、以及服務當日 08:00 後的
   * 指派師傅可以取得。
   */
  static full(props) {
    return new AddressView({ ...props, level: DisclosureLevel.FULL });
  }

  constructor(props) {
    assertOneOf(props.level, LEVELS, 'AddressView.level');

    // ⚠️ 這條不變式就是本物件存在的理由。
    // 直接用 new 建構時若傳錯組合，會在這裡被擋下 ——
    // 建議改用 AddressView.district() / AddressView.full() 這兩個 factory。
    invariant(
      props.level === DisclosureLevel.FULL || props.detailAddress === null || props.detailAddress === undefined,
      'AddressView：level 為 DISTRICT 時不得攜帶 detailAddress（請改用 AddressView.district()）',
      { level: props.level },
    );

    super({
      level: props.level,
      province: props.province || '',
      city: props.city || '',
      district: props.district || '',
      street: props.street || '',
      detailAddress: props.level === DisclosureLevel.FULL ? props.detailAddress || null : null,
    });
  }

  get level() {
    return this.props.level;
  }

  get province() {
    return this.props.province;
  }

  get city() {
    return this.props.city;
  }

  get district() {
    return this.props.district;
  }

  get street() {
    return this.props.street;
  }

  /** 非 FULL 時**保證為 null** */
  get detailAddress() {
    return this.props.detailAddress;
  }

  get isFull() {
    return this.props.level === DisclosureLevel.FULL;
  }

  /** 供顯示的摘要：DISTRICT 級只到街道 */
  toSummary() {
    return [this.props.province, this.props.city, this.props.district, this.props.street]
      .filter(Boolean)
      .join('');
  }

  toJSON() {
    return this.props;
  }
}

module.exports = { AddressView, DisclosureLevel, LEVELS };
