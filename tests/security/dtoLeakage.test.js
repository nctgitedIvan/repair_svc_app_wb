'use strict';

/**
 * DTO 洩漏掃描 —— docs/01 §1.7 第 7、8 項驗收標準的骨架。
 *
 * 目標：把「師傅端不得取得客戶完整敏感資料」從**自律**變成**可執行的斷言**。
 *
 * ⚠️ P1 只建骨架。完整版（遍歷所有師傅端 Use Case × 所有訂單狀態）
 *    要等 P5 的 Use Case 齊全後才有意義 —— 見本檔最後一組測試的說明。
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const { ComputeProfitShareUseCase } = require('../../packages/application/settlement/ComputeProfitShareUseCase');
const { buildTestContainer } = require('../helpers/container');
const { OrderStatus } = require('../../packages/domain/order/OrderStatus');

/**
 * 完整手機號的形狀：1 開頭、第二位 3-9、共 11 位，且前後不接其他數字。
 *
 * ⚠️ **不可用 /\d{11}/** —— 13 位時間戳（1700000000000）含有 11 位數字子字串，
 * 會產生偽陽性。P0 已實際踩過這個坑（docs/P0-驗證報告.md §5.4）。
 * 一個會誤報的安全測試，最後一定會被註解掉。
 */
const FULL_PHONE_RE = /(?<!\d)1[3-9]\d{9}(?!\d)/;

/** 完整地址的跡象：門牌、棟、樓、室 */
const DETAIL_ADDRESS_RE = /(\d+号|\d+號|\d+栋|\d+棟|\d+楼|\d+樓|\d+室|detailAddress)/;

/** 平台內部欄位：師傅端絕不可見（客服／管理員則依職責可見） */
const INTERNAL_FIELD_NAMES = ['profitSharingTerms', 'technicianRateBp', 'platformRateBp', 'platformShareCents', 'commissionRate'];

/**
 * 閱聽對象決定規則。這是本掃描器的核心設計。
 *
 * 為什麼不能只有一套規則：`platformShareCents`（平台抽成）對**師傅**是必須隱藏的
 * 內部資訊，對**客服**卻是回答客戶費用疑問的必要資料（docs/01 §4.6 △17）。
 * 用同一套規則掃描兩種 DTO，只會產生偽陽性 —— 而偽陽性的安全測試最後會被停用。
 */
const AUDIENCE_RULES = Object.freeze({
  /** 師傅：最嚴格。無完整手機號、無完整地址、無任何平台內部欄位 */
  technician: Object.freeze({ allowFullPhone: false, allowDetailAddress: false, allowInternalFields: false }),
  /** 客服／管理員：職責上可見完整資料與內部欄位 */
  internal: Object.freeze({ allowFullPhone: true, allowDetailAddress: true, allowInternalFields: true }),
  /** 客戶本人：看得到自己的完整資料，但看不到平台內部欄位 */
  customer: Object.freeze({ allowFullPhone: true, allowDetailAddress: true, allowInternalFields: false }),
});

function serialize(value) {
  return JSON.stringify(value, (key, v) => (typeof v === 'bigint' ? String(v) : v));
}

/**
 * 掃描一個 DTO 是否符合該閱聽對象的可見範圍。
 *
 * @param {any} dto
 * @param {{ audience?: 'technician'|'internal'|'customer' }} [options]
 * @returns {string[]} 問題清單（空陣列 = 通過）
 */
function findLeaks(dto, options = {}) {
  const audience = options.audience || 'technician';
  const rules = AUDIENCE_RULES[audience];
  if (!rules) throw new TypeError(`未知的閱聽對象：${audience}`);

  const text = serialize(dto);
  const problems = [];

  if (!rules.allowFullPhone && FULL_PHONE_RE.test(text)) {
    problems.push('含完整手機號');
  }
  if (!rules.allowDetailAddress && DETAIL_ADDRESS_RE.test(text)) {
    problems.push('含完整地址（門牌／棟／樓／室）');
  }
  if (!rules.allowInternalFields) {
    for (const field of INTERNAL_FIELD_NAMES) {
      if (text.includes(`"${field}"`)) problems.push(`含內部欄位 ${field}`);
    }
  }
  return problems;
}

test('掃描器本身的自我驗證（先確認它抓得到，否則後面的「通過」沒有意義）', async (t) => {
  await t.test('偵測得到完整手機號（師傅視角）', () => {
    assert.deepEqual(findLeaks({ phone: '13812345678' }), ['含完整手機號']);
  });

  await t.test('⚠️ 不誤判 13 位時間戳', () => {
    assert.deepEqual(findLeaks({ computedAt: 1_700_000_000_000 }), []);
    assert.deepEqual(findLeaks({ createdAt: 1_600_350_829_291 }), []);
  });

  await t.test('不誤判遮罩後的手機號', () => {
    assert.deepEqual(findLeaks({ phone: '138****1234' }), []);
    assert.deepEqual(findLeaks({ phone: '138****5678' }), []);
  });

  await t.test('不誤判金額與單號', () => {
    assert.deepEqual(findLeaks({ amountCents: 10000, orderNo: 'R20261016001' }), []);
  });

  await t.test('偵測得到完整地址', () => {
    const problems = findLeaks({ address: '深圳市寶安區中心路28號麗沙花都3棟5B' });
    assert.deepEqual(problems, ['含完整地址（門牌／棟／樓／室）']);
  });

  await t.test('區域級地址不算洩漏', () => {
    assert.deepEqual(findLeaks({ address: '深圳市寶安區沙井街道' }), []);
  });

  await t.test('偵測得到內部欄位', () => {
    const problems = findLeaks({ profitSharingTerms: { technicianRateBp: 8000 } });
    assert.ok(problems.some((p) => p.includes('profitSharingTerms')));
  });

  await t.test('巢狀結構也掃得到', () => {
    assert.deepEqual(findLeaks({ data: { list: [{ customer: { phone: '13900001111' } }] } }), ['含完整手機號']);
  });

  await t.test('⚠️ 同一份 DTO 在不同閱聽對象下判定不同（這是設計核心）', () => {
    const dto = { platformShareCents: 2000, customerPhone: '13812345678' };
    assert.ok(findLeaks(dto, { audience: 'technician' }).length > 0, '師傅不該看到這些');
    assert.deepEqual(findLeaks(dto, { audience: 'internal' }), [], '客服／管理員可見');
  });

  await t.test('未知的閱聽對象會拋錯（避免打錯字靜默變成寬鬆規則）', () => {
    assert.throws(() => findLeaks({}, { audience: 'tech' }), TypeError);
  });
});

test('既有 Use Case 的 DTO 掃描（P1 唯一的 Use Case）', async (t) => {
  function makeOrder() {
    return {
      id: 'order-1',
      orderNo: 'R20261016001',
      statusValue: OrderStatus.COMPLETED.value,
      serviceFeeCents: 10000,
      materialFeeCents: 2500,
      // 故意放入完整敏感資料，驗證 Use Case 不會把它們帶進 DTO
      customerPhone: '13812345678',
      detailAddress: '深圳市寶安區中心路28號麗沙花都3棟5B',
      createdAt: 1_700_000_000_000,
      version: 0,
      snapshot: {
        profitSharingTerms: {
          base: 'SERVICE_FEE',
          technicianRateBp: 8000,
          platformRateBp: 2000,
          roundingMode: 'FLOOR_TO_CENT',
          termsVersion: 'v1',
        },
      },
    };
  }

  await t.test('ComputeProfitShareUseCase 是客服視角，DTO 符合 internal 規則', async () => {
    const container = buildTestContainer();
    container.orderRepository.seed([makeOrder()]);
    const useCase = new ComputeProfitShareUseCase(container);

    const result = await useCase.execute({ actor: { id: 'cs-1', role: 'cs_agent' }, orderId: 'order-1' });
    assert.ok(result.ok, `預期成功，實際：${JSON.stringify(result.error)}`);

    // 客服可讀分潤（§4.6 △17），故 platformShareCents 合法
    assert.deepEqual(findLeaks(result.value, { audience: 'internal' }), []);
  });

  await t.test('⚠️ 即使有權，這個 Use Case 也不回傳它不需要的客戶 PII', async () => {
    const container = buildTestContainer();
    container.orderRepository.seed([makeOrder()]);
    const useCase = new ComputeProfitShareUseCase(container);
    const result = await useCase.execute({ actor: { id: 'cs-1', role: 'cs_agent' }, orderId: 'order-1' });

    const text = serialize(result.value);
    assert.equal(FULL_PHONE_RE.test(text), false, '這個 Use Case 不需要客戶手機號');
    assert.equal(DETAIL_ADDRESS_RE.test(text), false, '這個 Use Case 不需要客戶地址');
    assert.equal(text.includes('"snapshot"'), false, '不得回傳整個 snapshot');
    assert.equal(text.includes('"version"'), false, '不得回傳持久化欄位');
  });

  await t.test('失敗結果同樣不得洩漏', async () => {
    const container = buildTestContainer();
    const useCase = new ComputeProfitShareUseCase(container);

    const result = await useCase.execute({ actor: { id: 'cs-1', role: 'cs_agent' }, orderId: 'not-exist' });
    assert.equal(result.isFailure, true);
    assert.deepEqual(findLeaks(result.error, { audience: 'technician' }), []);
  });
});

test('⚠️ 完整掃描待 P5 補齊（誠實標註，不假裝已覆蓋）', async (t) => {
  await t.test('目前只有 1 個 Use Case 可掃描', () => {
    // P1 刻意不含業務邏輯，因此可掃描的 Use Case 只有 P0 建立的那一個。
    // 完整的「遍歷所有師傅端 Use Case × 所有訂單狀態」要等 P5。
    const useCases = [ComputeProfitShareUseCase];
    assert.equal(useCases.length, 1, '若 Use Case 增加，請同步擴充本檔的掃描清單');
  });

  await t.test('掃描器已可重用（P5 直接匯入即可）', () => {
    // 這個斷言的作用是「把 findLeaks 與 AUDIENCE_RULES 標記為公開契約」，
    // 避免日後有人把它們改成區域變數而讓 P5 無法重用。
    assert.equal(typeof findLeaks, 'function');
    assert.equal(FULL_PHONE_RE instanceof RegExp, true);
    assert.ok(AUDIENCE_RULES.technician && AUDIENCE_RULES.internal && AUDIENCE_RULES.customer);
  });
});

module.exports = { findLeaks, AUDIENCE_RULES, FULL_PHONE_RE, DETAIL_ADDRESS_RE };
