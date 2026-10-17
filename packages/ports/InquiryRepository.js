'use strict';

/**
 * InquiryRepository —— 商品詢問的持久化契約（T6b／P5）。
 *
 * ```js
 * {
 *   inquiryId, customerId, productId,
 *   productSnapshot: { name, image, priceCents },
 *   message, status: 'pending' | 'replied' | 'closed',
 *   createdAt, csAgentId,
 *   replies: [{ actorId, actorRole, body, createdAt }],
 * }
 * ```
 *
 * 實作：CloudDBInquiryRepository、InMemoryInquiryRepository
 */
const InquiryRepository = Object.freeze({
  name: 'InquiryRepository',
  methods: Object.freeze([
    'create',
    'findById',
    'listByCustomer',
    'listPending',
    'appendReply',
    'close',
  ]),
  contract: Object.freeze({
    create: '(inquiry: InquiryRecord): Promise<void>',
    findById: '(inquiryId: string): Promise<InquiryRecord|null>',
    /** 依 createdAt 由新到舊 */
    listByCustomer: '(customerId: string): Promise<InquiryRecord[]>',
    /** status='pending'，依 createdAt 由舊到新（客服待處理佇列） */
    listPending: '(): Promise<InquiryRecord[]>',
    /** 追加客服回覆，狀態改為 replied */
    appendReply:
      '(inquiryId: string, reply: { actorId: string, actorRole: string, body: string, createdAt: number }): Promise<InquiryRecord>',
    /** 結束詢問，狀態改為 closed */
    close: '(inquiryId: string, options?: { csAgentId?: string }): Promise<InquiryRecord>',
  }),
});

module.exports = { InquiryRepository };
