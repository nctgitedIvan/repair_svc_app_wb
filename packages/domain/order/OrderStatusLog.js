'use strict';

const { invariant, assertNonEmptyString, assertInteger } = require('../shared/assertions');

/**
 * OrderStatusLog —— 狀態流轉紀錄（聚合內實體）。
 *
 * 每一筆狀態變更都留下一筆，形成訂單的完整歷程。
 * 這是客服與客戶爭議時的第一手依據。
 *
 * 不可變：寫入後不得修改（時間軸只能追加）。
 */
class OrderStatusLog {
  #props;

  /**
   * @param {object} props
   * @param {string} props.fromKey    來源狀態 key（建立時為 null）
   * @param {string} props.toKey      目標狀態 key
   * @param {string} props.actorId    操作者 userId
   * @param {string} props.actorRole  操作者角色
   * @param {number} props.at         Unix 毫秒（由呼叫方經 ClockPort 取得後傳入）
   * @param {string} [props.reason]   原因（取消／拒單／作廢必填）
   */
  constructor(props) {
    invariant(props.fromKey === null || typeof props.fromKey === 'string', 'OrderStatusLog.fromKey 必須是字串或 null');
    assertNonEmptyString(props.toKey, 'OrderStatusLog.toKey');
    assertNonEmptyString(props.actorId, 'OrderStatusLog.actorId');
    assertNonEmptyString(props.actorRole, 'OrderStatusLog.actorRole');
    assertInteger(props.at, 'OrderStatusLog.at', { min: 0 });

    this.#props = Object.freeze({
      fromKey: props.fromKey,
      toKey: props.toKey,
      actorId: props.actorId,
      actorRole: props.actorRole,
      at: props.at,
      reason: props.reason || null,
    });
  }

  get fromKey() { return this.#props.fromKey; }
  get toKey() { return this.#props.toKey; }
  get actorId() { return this.#props.actorId; }
  get actorRole() { return this.#props.actorRole; }
  get at() { return this.#props.at; }
  get reason() { return this.#props.reason; }

  toJSON() {
    return { ...this.#props };
  }

  static rehydrate(row) {
    return new OrderStatusLog(row);
  }
}

module.exports = { OrderStatusLog };
