'use strict';

/**
 * TechnicianRepository —— 師傅檔案的持久化契約。
 *
 * TechnicianRecord（camelCase）：
 * ```js
 * {
 *   technicianId, userId, name, phone,
 *   status: 'pending' | 'approved' | 'rejected' | 'disabled',
 *   skillTags: string[],
 *   level, approvedAt,
 * }
 * ```
 *
 * 實作：CloudDBTechnicianRepository、InMemoryTechnicianRepository
 */
const TechnicianRepository = Object.freeze({
  name: 'TechnicianRepository',
  methods: Object.freeze(['findById', 'findByUserId', 'save', 'listByStatus']),
  contract: Object.freeze({
    findById: '(technicianId: string): Promise<TechnicianRecord|null>',
    findByUserId: '(userId: string): Promise<TechnicianRecord|null>',
    save: '(technician: TechnicianRecord): Promise<void>',
    listByStatus: '(status: string): Promise<TechnicianRecord[]>',
  }),
});

module.exports = { TechnicianRepository };
