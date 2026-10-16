'use strict';

const { ValueObject } = require('./ValueObject');
const { assertNonEmptyString } = require('./assertions');
const { AddressView, DisclosureLevel } = require('./AddressView');

/**
 * Address —— **完整**地址。
 *
 * 只有客服、管理員、以及訂單本人的客戶可以持有它。
 * 師傅端一律拿 `AddressView`（見 `AddressDisclosurePolicy`）。
 *
 * 本物件提供 `toView(level)` 主動降級 —— 讓「呼叫端想要完整地址」
 * 這件事必須明確寫出來，而不是不小心就得到了。
 */
class Address extends ValueObject {
  constructor(props) {
    assertNonEmptyString(props.province, 'Address.province');
    assertNonEmptyString(props.city, 'Address.city');
    assertNonEmptyString(props.district, 'Address.district');
    assertNonEmptyString(props.detailAddress, 'Address.detailAddress');
    super({
      province: props.province,
      city: props.city,
      district: props.district,
      street: props.street || '',
      detailAddress: props.detailAddress,
      // 座標可選；師傅端導航用，因此不視為敏感（但也不主動提供）
      latitude: props.latitude === undefined ? null : props.latitude,
      longitude: props.longitude === undefined ? null : props.longitude,
    });
  }

  get province() { return this.props.province; }
  get city() { return this.props.city; }
  get district() { return this.props.district; }
  get street() { return this.props.street; }
  get detailAddress() { return this.props.detailAddress; }

  get fullText() {
    return `${this.toDistrictView().toSummary()}${this.props.detailAddress}`;
  }

  /** 降級為區域級視圖 */
  toDistrictView() {
    return AddressView.district({
      province: this.props.province,
      city: this.props.city,
      district: this.props.district,
      street: this.props.street,
    });
  }

  /** 升級為完整視圖 */
  toFullView() {
    return AddressView.full({
      province: this.props.province,
      city: this.props.city,
      district: this.props.district,
      street: this.props.street,
      detailAddress: this.props.detailAddress,
    });
  }

  toJSON() {
    return this.props;
  }
}

module.exports = { Address };
