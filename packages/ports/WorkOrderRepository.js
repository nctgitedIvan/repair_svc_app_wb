'use strict';

/**
 * WorkOrderRepository —— 客服工單主檔的持久化契約。
 *
 * ```js
 * { ticketId, orderId, status, csAgentId, createdAt, updatedAt }
 * ```
 *
 * 唯一鍵：`orderId`（每訂單一主工單）。
 *
 * 實作：CloudDBWorkOrderRepository、InMemoryWorkOrderRepository
 */
const WorkOrderRepository = Object.freeze({
  name: 'WorkOrderRepository',
  methods: Object.freeze(['findByOrderId', 'listByStatus', 'save']),
  contract: Object.freeze({
    findByOrderId: '(orderId: string): Promise<WorkOrderRecord|null>',
    listByStatus: '(status: string): Promise<WorkOrderRecord[]>',
    save: '(ticket: WorkOrderRecord): Promise<void>',
  }),
});

module.exports = { WorkOrderRepository };
