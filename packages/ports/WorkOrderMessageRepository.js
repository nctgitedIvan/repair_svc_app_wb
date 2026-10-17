'use strict';

/**
 * WorkOrderMessageRepository —— 工單訊息的持久化契約（只 append）。
 *
 * ```js
 * { messageId, ticketId, actorId, actorRole, body, createdAt }
 * ```
 *
 * 實作：CloudDBWorkOrderMessageRepository、InMemoryWorkOrderMessageRepository
 */
const WorkOrderMessageRepository = Object.freeze({
  name: 'WorkOrderMessageRepository',
  methods: Object.freeze(['listByTicketId', 'append']),
  contract: Object.freeze({
    /** 依 createdAt 升序 */
    listByTicketId: '(ticketId: string): Promise<MessageRecord[]>',
    append: '(message: MessageRecord): Promise<void>',
  }),
});

module.exports = { WorkOrderMessageRepository };
