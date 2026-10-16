'use strict';

const { ValueObject } = require('./ValueObject');
const { invariant, assertNonEmptyString } = require('./assertions');

/**
 * OrderNo —— 訂單號值物件。
 *
 * 格式：`R` + `YYYYMMDD` + 6 位序號，例如 `R20261016000001`。
 * 前綴可反解業務類型（`R` = repair），方便人工辨識與對帳。
 */
const ORDER_NO_RE = /^R\d{8}\d{6}$/;
const MAX_LENGTH = 32;

class OrderNo extends ValueObject {
  constructor(value) {
    assertNonEmptyString(value, 'OrderNo');
    invariant(value.length <= MAX_LENGTH, `OrderNo 長度不得超過 ${MAX_LENGTH}`, { length: value.length });
    invariant(ORDER_NO_RE.test(value), `OrderNo 格式不符（預期 R + 8 位日期 + 6 位序號）`, {
      received: value,
    });
    super({ value });
  }

  get value() {
    return this.props.value;
  }

  /** 建立時的日期部分，供對帳分群使用 */
  get datePart() {
    return this.props.value.slice(1, 9);
  }

  get sequencePart() {
    return this.props.value.slice(9);
  }

  toJSON() {
    return { value: this.props.value };
  }
}

module.exports = { OrderNo, ORDER_NO_RE };
