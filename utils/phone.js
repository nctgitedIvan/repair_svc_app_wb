/**
 * 前端手機號工具（澳門 853／大陸 86）。
 *
 * ⚠️ 為什麼不直接 import `packages/domain`：
 *   小程序前端不得引用 `packages/`（docs/04 紅線 2）。
 *   因此這裡保留一份**與 domain 相同規則**的實作；
 *   `tests/unit/frontend/phone.test.js` 會拿兩邊的輸出一一對照。
 */

const COUNTRY = Object.freeze({
  MACAU: '853',
  MAINLAND: '86',
});

const COUNTRY_OPTIONS = Object.freeze([
  { value: COUNTRY.MACAU, label: '+853 澳門', digits: 8, placeholder: '6612 3456' },
  { value: COUNTRY.MAINLAND, label: '+86 大陸', digits: 11, placeholder: '138 1234 5678' },
]);

const CN_MOBILE_RE = /^1[3-9]\d{9}$/;
const MO_MOBILE_RE = /^\d{8}$/;

function digitsOnly(input) {
  return String(input).replace(/[\s\-()]/g, '');
}

/**
 * 解析手機號。
 * 接受：853+8、86+11、純 11 位（視為大陸）。
 * @returns {{countryCode:string,nationalNumber:string,e164:string,formatted:string,masked:string}|null}
 */
function parsePhone(input) {
  if (typeof input !== 'string' || input.trim().length === 0) return null;

  let raw = digitsOnly(input);
  if (raw.startsWith('+')) raw = raw.slice(1);

  let countryCode;
  let nationalNumber;

  if (raw.startsWith(COUNTRY.MACAU)) {
    countryCode = COUNTRY.MACAU;
    nationalNumber = raw.slice(3);
  } else if (raw.startsWith(COUNTRY.MAINLAND)) {
    countryCode = COUNTRY.MAINLAND;
    nationalNumber = raw.slice(2);
  } else {
    countryCode = COUNTRY.MAINLAND;
    nationalNumber = raw;
  }

  if (countryCode === COUNTRY.MACAU) {
    if (!MO_MOBILE_RE.test(nationalNumber)) return null;
  } else if (!CN_MOBILE_RE.test(nationalNumber)) {
    return null;
  }

  const formatted =
    countryCode === COUNTRY.MACAU
      ? `+${countryCode} ${nationalNumber.slice(0, 4)} ${nationalNumber.slice(4)}`
      : `+${countryCode} ${nationalNumber.slice(0, 3)} ${nationalNumber.slice(3, 7)} ${nationalNumber.slice(7)}`;

  const masked =
    countryCode === COUNTRY.MACAU
      ? `${countryCode} ${nationalNumber.slice(0, 2)}** ****`
      : `${nationalNumber.slice(0, 3)} **** ${nationalNumber.slice(7)}`;

  return {
    countryCode,
    nationalNumber,
    e164: `+${countryCode}${nationalNumber}`,
    formatted,
    masked,
  };
}

function isValidPhone(input) {
  return parsePhone(input) !== null;
}

function formatPhone(input) {
  const parsed = parsePhone(input);
  return parsed ? parsed.formatted : String(input || '');
}

function maskPhone(input) {
  const parsed = parsePhone(input);
  if (parsed) return parsed.masked;
  const text = String(input || '');
  return text.includes('*') ? text : text;
}

/** 把完整號碼拆成區號＋本地號碼（地址編輯頁用）；無法解析時預設 +853 */
function splitPhone(input) {
  const parsed = parsePhone(input);
  if (!parsed) return { countryCode: COUNTRY.MACAU, nationalNumber: '' };
  return { countryCode: parsed.countryCode, nationalNumber: parsed.nationalNumber };
}

function optionOf(countryCode) {
  return COUNTRY_OPTIONS.find((option) => option.value === countryCode) || COUNTRY_OPTIONS[0];
}

module.exports = {
  COUNTRY,
  COUNTRY_OPTIONS,
  CN_MOBILE_RE,
  MO_MOBILE_RE,
  parsePhone,
  isValidPhone,
  formatPhone,
  maskPhone,
  splitPhone,
  optionOf,
};
