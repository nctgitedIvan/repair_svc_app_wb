'use strict';

/**
 * PaymentGateway —— 支付／退款／分帳的外部介面。
 *
 * ⚠️ 真實實作（微信支付）屬 P6；P5 只用 `MockPaymentGateway`。
 *    Domain／Application **不得** import 任何微信 SDK。
 */
const PaymentGateway = Object.freeze({
  name: 'PaymentGateway',
  methods: Object.freeze(['createPayment', 'refund', 'executeProfitSharing']),
  contract: Object.freeze({
    /**
     * 建立預支付。
     * @returns {Promise<{ ok: boolean, prepayId?: string, channel?: string, code?: string, message?: string }>}
     */
    createPayment: '({ orderId, orderNo, amountCents, currency, outTradeNo }): Promise<object>',

    /** 退款 */
    refund: '({ orderId, orderNo, outRefundNo, amountCents, reason }): Promise<object>',

    /** 分帳（P6 才接真實 API） */
    executeProfitSharing:
      '({ orderId, orderNo, outOrderNo, receiverId, amountCents }): Promise<object>',
  }),
});

module.exports = { PaymentGateway };
