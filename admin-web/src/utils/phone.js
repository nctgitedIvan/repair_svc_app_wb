const COUNTRY = {
  MACAU: '853',
  MAINLAND: '86',
};

export const COUNTRY_OPTIONS = [
  { value: COUNTRY.MACAU, label: '+853 澳門', digits: 8, placeholder: '6612 3456' },
  { value: COUNTRY.MAINLAND, label: '+86 大陸', digits: 11, placeholder: '138 1234 5678' },
];

const CN_MOBILE_RE = /^1[3-9]\d{9}$/;
const MO_MOBILE_RE = /^\d{8}$/;

function digitsOnly(input) {
  return String(input).replace(/[\s\-()]/g, '');
}

/** 解析澳門 853／大陸 86／純 11 位手機 */
export function parsePhone(input) {
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

export function isValidPhone(input) {
  return parsePhone(input) !== null;
}

export function formatPhone(input) {
  const parsed = parsePhone(input);
  return parsed ? parsed.formatted : String(input || '');
}

export function maskPhone(input) {
  const parsed = parsePhone(input);
  return parsed ? parsed.masked : String(input || '');
}

export { COUNTRY };
