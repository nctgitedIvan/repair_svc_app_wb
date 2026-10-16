'use strict';

/**
 * SettlementGateway —— 金流的統一介面（docs/01 §9.4）。
 *
 * 這是一個 **capability-based** 介面：主方案（服務商分帳）與備案
 * （平台代收 + 企業付款）都實作同一個契約，差異由 `capabilities()` 表達。
 * Use Case 因此**完全不需要知道**背後是哪一種模式。
 *
 * 這是六角形架構在此專案的實際回報：本案最大的外部不確定性
 * （商戶號與分帳權限尚未取得），被壓縮成一個可替換的 adapter。
 *
 * ⛔ A1 確認前禁止實作：WeChatPaySettlementAdapter、PlatformEscrowSettlementAdapter
 * ✅ P1–P5 使用：InMemorySettlementAdapter
 *
 * ⚠️ 需人工核對：實際 API 端點、欄位名、簽章方式、限額與次數限制，
 *    一律於 P6 查閱微信支付官方文檔後，集中封裝在 adapter 內，
 *    **不在此介面洩漏任何微信專屬詞彙**。
 */

/** 結算模式 */
const SettlementMode = Object.freeze({
  /** 主方案：服務商分帳。資金凍結於特約商戶，完工後分帳給師傅 */
  PROFIT_SHARING: 'PROFIT_SHARING',
  /** 備案：平台代收，另以企業付款結算給師傅 */
  PLATFORM_ESCROW: 'PLATFORM_ESCROW',
});

/** 結算／退款結果狀態 */
const SettlementStatus = Object.freeze({
  SUCCESS: 'SUCCESS',
  FAILED: 'FAILED',
  /** 非同步處理中，需靠 query 收斂 */
  PENDING: 'PENDING',
});

const SettlementGateway = Object.freeze({
  name: 'SettlementGateway',
  methods: Object.freeze(['capabilities', 'onPaymentSuccess', 'settle', 'beforeRefund', 'refund', 'querySettlement']),

  contract: Object.freeze({
    /**
     * 能力宣告。Use Case 據此決定要不要執行分帳回退等步驟。
     *
     * @returns {{
     *   settlementMode: string,
     *   supportsFreeze: boolean,          // 分帳模式：true（資金先凍結）
     *   supportsSharingReturn: boolean,   // 分帳模式：true（退款前需回退）
     *   supportsPartialRefund: boolean,   // 兩種模式皆應為 true
     *   requiresReceiverOnboarding: boolean // 分帳模式：師傅需先進件
     * }}
     */
    capabilities: '(): SettlementCapabilities',

    /**
     * 支付成功後的通知。
     * 主方案：帶分帳標識、凍結資金。
     * 備案：空操作（款項直接進平台）。
     *
     * @param {object} order
     * @param {{ transactionId: string, outTradeNo: string, amountCents: number }} payment
     * @returns {Promise<void>}
     */
    onPaymentSuccess: '(order, payment): Promise<void>',

    /**
     * 結算給師傅。
     * 主方案：請求分帳。備案：寫入待付款佇列，由批次企業付款處理。
     *
     * ⚠️ 非同步。回傳 PENDING 時必須靠 `querySettlement` 收斂。
     *
     * @param {object} order
     * @returns {Promise<{ status: string, reference: string|null, raw?: object }>}
     */
    settle: '(order): Promise<SettlementOutcome>',

    /**
     * 退款前的必要步驟（docs/01 §9.4，你的業務規則 6）。
     *
     * 主方案：**執行分帳回退**，把資金從師傅帳戶退回平台。
     *         回退總金額不得超過原分帳給該接收方的金額。
     * 備案：空操作。
     *
     * ⚠️ 若回退失敗，**必須阻止後續退款**，不可逕行退款。
     *
     * @param {object} order
     * @param {number} refundAmountCents
     * @returns {Promise<{ status: string, returnedCents: number, reference: string|null }>}
     */
    beforeRefund: '(order, refundAmountCents): Promise<SettlementOutcome>',

    /**
     * 發起退款（原路返回）。
     * 每筆退款需不同的商戶退款單號；單筆訂單可多次部分退款。
     *
     * @param {object} order
     * @param {{ outRefundNo: string, amountCents: number, reason: string }} refundRequest
     * @returns {Promise<{ status: string, reference: string|null }>}
     */
    refund: '(order, refundRequest): Promise<SettlementOutcome>',

    /**
     * 查詢非同步結果，供定時任務 RecoverStuckSettlements 收斂卡住的紀錄。
     *
     * @param {string} reference
     * @returns {Promise<{ status: string, raw?: object }>}
     */
    querySettlement: '(reference: string): Promise<SettlementOutcome>',
  }),
});

module.exports = { SettlementGateway, SettlementMode, SettlementStatus };
