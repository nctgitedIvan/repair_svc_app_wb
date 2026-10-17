'use strict';

/**
 * CsAgentRepository —— 客服檔案的持久化契約。
 *
 * CsAgentRecord（camelCase）：
 * ```js
 * {
 *   csAgentId, userId, employeeNo, name,
 *   regions: string[],
 *   status: 'active' | 'disabled',
 *   dailyRefundBudget: { date: 'YYYY-MM-DD', usedCents, limitCents },
 * }
 * ```
 *
 * `incrementDailyRefundUsage` 必須是**原子**的（同一 doc，事務或 `_.inc`）。
 * 金額上限的判斷屬 domain／application，不在本 Port。
 */
const CsAgentRepository = Object.freeze({
  name: 'CsAgentRepository',
  methods: Object.freeze(['findById', 'findByUserId', 'save', 'incrementDailyRefundUsage']),
  contract: Object.freeze({
    findById: '(csAgentId: string): Promise<CsAgentRecord|null>',
    findByUserId: '(userId: string): Promise<CsAgentRecord|null>',
    save: '(csAgent: CsAgentRecord): Promise<void>',

    /**
     * 增加當日已用退款額度；跨日時重設 usedCents。
     *
     * @param {{ csAgentId: string, date: string, amountCents: number }} args
     * @returns {Promise<{ date: string, usedCents: number, limitCents: number }>}
     */
    incrementDailyRefundUsage:
      '({ csAgentId: string, date: string, amountCents: number }): Promise<DailyBudget>',
  }),
});

module.exports = { CsAgentRepository };
