'use strict';

/**
 * SequenceIdGeneratorAdapter —— 用 IdSequenceRepository 產生單號（測試／P5）。
 *
 * 訂單號格式：`R` + `YYYYMMDD` + 6 位序號（符合 `OrderNo` 的規則）。
 * 對外交易號：`WX` + 訂單號。
 * 退款號：`RF` + 訂單號 + 2 位序號。
 */
class SequenceIdGeneratorAdapter {
  constructor({ idSequence, clock }) {
    if (!idSequence) throw new TypeError('SequenceIdGeneratorAdapter 需要 idSequence');
    if (!clock) throw new TypeError('SequenceIdGeneratorAdapter 需要 clock');
    this.idSequence = idSequence;
    this.clock = clock;
  }

  async nextOrderNo() {
    const date = datePart(this.clock.now());
    const seq = await this.idSequence.next(`order:${date}`);
    return `R${date}${String(seq).padStart(6, '0')}`;
  }

  nextOutTradeNo(orderNo) {
    assertString(orderNo, 'orderNo');
    return `WX${orderNo}`;
  }

  nextOutRefundNo(orderNo, seq) {
    assertString(orderNo, 'orderNo');
    if (!Number.isInteger(seq) || seq < 1) throw new TypeError('seq 必須是正整數');
    return `RF${orderNo}${String(seq).padStart(2, '0')}`;
  }
}

/** UTC+8 的 YYYYMMDD */
function datePart(now) {
  if (!Number.isInteger(now)) throw new TypeError('now 必須是整數');
  const shifted = new Date(now + 480 * 60_000);
  const y = shifted.getUTCFullYear();
  const m = String(shifted.getUTCMonth() + 1).padStart(2, '0');
  const d = String(shifted.getUTCDate()).padStart(2, '0');
  return `${y}${m}${d}`;
}

function assertString(value, name) {
  if (typeof value !== 'string' || value.length === 0) {
    throw new TypeError(`${name} 必須是非空字串`);
  }
}

module.exports = { SequenceIdGeneratorAdapter };
