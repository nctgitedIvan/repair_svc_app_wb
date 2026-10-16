'use strict';

/**
 * validate —— ① 參數校驗（雲函數入口的職責之一）。
 *
 * 設計原則（docs/01 §1.6.4）：入口只描述「形狀」，**不含業務規則**。
 * 這裡只回答「這個欄位是不是字串、有沒有超過長度」，
 * 不回答「這個訂單能不能派單」——後者是 Use Case 與 domain 的事。
 *
 * 零依賴自製，不引入 ajv / zod：
 *   - 雲函數 bundle 越小越好
 *   - 供應鏈風險為零
 *   - 需求單純（型別、必填、長度、枚舉）
 */

const { Result } = require('@repair/shared-kernel/Result');

const ALLOWED_TYPES = ['string', 'number', 'integer', 'boolean', 'array', 'object', 'any'];

/**
 * 依 schema 校驗輸入。
 *
 * @param {object} input  event 物件
 * @param {object} schema 例如 { orderId: { type: 'string', required: true, maxLength: 64 } }
 * @param {{ rejectUnknown?: boolean }} [options]
 * @returns {{ ok: true, value: object } | { ok: false, error: object }}
 */
function validate(input, schema, options = {}) {
  const { rejectUnknown = true } = options;

  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    return Result.validation('輸入必須是物件', { received: describe(input) });
  }
  if (schema === null || typeof schema !== 'object') {
    throw new TypeError('schema 必須是物件');
  }

  const errors = [];
  const value = {};

  // ① 未知欄位：預設拒絕。避免前端偷偷塞 technicianId 之類的越權參數
  if (rejectUnknown) {
    const known = new Set(Object.keys(schema));
    for (const key of Object.keys(input)) {
      if (!known.has(key)) {
        errors.push({ field: key, rule: 'unknown', message: `不允許的欄位：${key}` });
      }
    }
  }

  for (const [field, rule] of Object.entries(schema)) {
    const raw = input[field];
    const present = raw !== undefined && raw !== null && raw !== '';

    if (!present) {
      if (rule.required) {
        errors.push({ field, rule: 'required', message: `缺少必填欄位：${field}` });
      } else if (rule.default !== undefined) {
        value[field] = rule.default;
      }
      continue;
    }

    if (rule.type && rule.type !== 'any' && !matchesType(raw, rule.type)) {
      errors.push({ field, rule: 'type', message: `${field} 必須是 ${rule.type}`, actual: describe(raw) });
      continue;
    }

    if (typeof raw === 'string') {
      if (rule.minLength !== undefined && raw.length < rule.minLength) {
        errors.push({ field, rule: 'minLength', message: `${field} 長度不得少於 ${rule.minLength}` });
        continue;
      }
      if (rule.maxLength !== undefined && raw.length > rule.maxLength) {
        errors.push({ field, rule: 'maxLength', message: `${field} 長度不得超過 ${rule.maxLength}` });
        continue;
      }
      if (rule.pattern && !rule.pattern.test(raw)) {
        errors.push({ field, rule: 'pattern', message: `${field} 格式不符` });
        continue;
      }
      // 不 trim：訂單備註等欄位的空白可能有意義，交由業務層決定
    }

    if (typeof raw === 'number') {
      if (rule.min !== undefined && raw < rule.min) {
        errors.push({ field, rule: 'min', message: `${field} 不得小於 ${rule.min}` });
        continue;
      }
      if (rule.max !== undefined && raw > rule.max) {
        errors.push({ field, rule: 'max', message: `${field} 不得大於 ${rule.max}` });
        continue;
      }
    }

    if (rule.enum && !rule.enum.includes(raw)) {
      errors.push({ field, rule: 'enum', message: `${field} 必須是 ${rule.enum.join(' / ')} 之一`, actual: raw });
      continue;
    }

    // 自訂校驗：仍只描述形狀，不承載業務規則
    if (typeof rule.validate === 'function') {
      const custom = rule.validate(raw);
      if (custom !== true && custom !== undefined) {
        errors.push({ field, rule: 'custom', message: typeof custom === 'string' ? custom : `${field} 校驗失敗` });
        continue;
      }
    }

    value[field] = raw;
  }

  if (errors.length > 0) {
    return Result.validation('參數校驗失敗', { errors });
  }
  return Result.ok(value);
}

function matchesType(value, type) {
  switch (type) {
    case 'string':
      return typeof value === 'string';
    case 'number':
      return typeof value === 'number' && Number.isFinite(value);
    case 'integer':
      return Number.isInteger(value);
    case 'boolean':
      return typeof value === 'boolean';
    case 'array':
      return Array.isArray(value);
    case 'object':
      return value !== null && typeof value === 'object' && !Array.isArray(value);
    case 'any':
      return true;
    default:
      throw new TypeError(`未知的型別：${type}（可用：${ALLOWED_TYPES.join(', ')}）`);
  }
}

function describe(value) {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}

module.exports = { validate, ALLOWED_TYPES };
