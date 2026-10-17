'use strict';

const { ValueObject } = require('../shared/ValueObject');
const { PhoneNumber } = require('../shared/PhoneNumber');
const {
  invariant,
  assertNonEmptyString,
  assertInteger,
  assertArray,
} = require('../shared/assertions');

const MAX_DESCRIPTION_LENGTH = 500;
const MAX_MEDIA_COUNT = 9;

/**
 * AppointmentInfo —— 服務預約的完整資訊（值物件）。
 *
 * 與 Order 上既有的 `address`／`appointmentAt` 並存：
 *   - `address` 是結構化地址（給地址分級揭露用）
 *   - `appointmentInfo` 是**下單當下的預約表單快照**（給客服／師傅／詳情頁用）
 *
 * 欄位：
 * ```js
 * {
 *   appointmentAt,   // epoch ms
 *   address,         // 完整地址文字（快照）
 *   contactName,
 *   contactPhone,    // 正規化後顯示格式（+853 …／+86 …）
 *   description,     // 問題描述，最多 500 字
 *   mediaUrls,       // 圖片／語音的本機或雲端路徑（P7a 為本機暫存）
 * }
 * ```
 *
 * ⚠️ `mediaUrls` 目前是字串；語音以 `audio:` 前綴區分（例如 `audio:3`）。
 *    P5 換成雲端 fileID 後仍沿用同一個欄位。
 */
class AppointmentInfo extends ValueObject {
  constructor(props) {
    assertInteger(props.appointmentAt, 'AppointmentInfo.appointmentAt', { min: 0 });
    assertNonEmptyString(props.address, 'AppointmentInfo.address');
    assertNonEmptyString(props.contactName, 'AppointmentInfo.contactName');

    const phone = PhoneNumber.of(props.contactPhone);
    const description = typeof props.description === 'string' ? props.description : '';
    invariant(
      Array.from(description).length <= MAX_DESCRIPTION_LENGTH,
      `問題描述不得超過 ${MAX_DESCRIPTION_LENGTH} 字`,
      { length: Array.from(description).length, max: MAX_DESCRIPTION_LENGTH },
    );

    assertArray(props.mediaUrls === undefined ? [] : props.mediaUrls, 'AppointmentInfo.mediaUrls');
    invariant(
      props.mediaUrls === undefined || props.mediaUrls.length <= MAX_MEDIA_COUNT,
      `附件不得超過 ${MAX_MEDIA_COUNT} 個`,
    );
    invariant(
      props.mediaUrls === undefined ||
        props.mediaUrls.every((url) => typeof url === 'string' && url.length > 0),
      'AppointmentInfo.mediaUrls 必須是非空字串陣列',
    );

    super({
      appointmentAt: props.appointmentAt,
      address: props.address,
      contactName: props.contactName,
      contactPhone: phone.formatted,
      description,
      mediaUrls: props.mediaUrls ? [...props.mediaUrls] : [],
    });
  }

  get appointmentAt() { return this.props.appointmentAt; }
  get address() { return this.props.address; }
  get contactName() { return this.props.contactName; }
  get contactPhone() { return this.props.contactPhone; }
  get description() { return this.props.description; }
  get mediaUrls() { return [...this.props.mediaUrls]; }

  toJSON() {
    return {
      appointmentAt: this.props.appointmentAt,
      address: this.props.address,
      contactName: this.props.contactName,
      contactPhone: this.props.contactPhone,
      description: this.props.description,
      mediaUrls: [...this.props.mediaUrls],
    };
  }

  static rehydrate(row) {
    return new AppointmentInfo(row);
  }
}

module.exports = { AppointmentInfo, MAX_DESCRIPTION_LENGTH, MAX_MEDIA_COUNT };
