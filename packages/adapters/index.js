'use strict';

/**
 * @repair/adapters —— Ports 的實作。
 *
 * 本層是唯一允許接觸外部世界的層（微信雲 SDK、微信支付 API、HTTP、系統時間）。
 * 鐵律（docs/01-目標架構.md §1.6.5）：**只做翻譯，零業務規則**。
 *   - 不得做金額計算
 *   - 不得決定狀態流轉
 *   - 不得計算分潤比例
 * 判準：把 adapter 換成 in-memory fake，業務行為必須完全不變。
 *
 * ⛔ A1 確認前禁止實作：WeChatPayApiV3Adapter、CloudPayProfitSharingAdapter、
 *    WeChatProfitSharingSettlementAdapter、PlatformEscrowSettlementAdapter
 *    （見 docs/01-目標架構.md §9.0）
 */

const { SystemClockAdapter } = require('./time/SystemClockAdapter');
const { FixedClockAdapter } = require('./time/FixedClockAdapter');
const { InMemoryLoggerAdapter } = require('./logging/InMemoryLoggerAdapter');
const { InMemoryOrderRepository } = require('./inmemory/InMemoryOrderRepository');
const { InMemorySettlementAdapter } = require('./inmemory/InMemorySettlementAdapter');
const { InMemoryUserRepository } = require('./inmemory/InMemoryUserRepository');
const { createInMemoryUnitOfWork } = require('./inmemory/InMemoryUnitOfWork');
const { InMemoryIdSequenceRepository } = require('./inmemory/InMemoryIdSequenceRepository');
const { InMemoryAuditLogRepository } = require('./inmemory/InMemoryAuditLogRepository');
const { InMemorySystemConfigRepository } = require('./inmemory/InMemorySystemConfigRepository');
const { InMemoryCategoryRepository } = require('./inmemory/InMemoryCategoryRepository');
const { InMemoryCustomerRepository } = require('./inmemory/InMemoryCustomerRepository');
const { InMemoryCsAgentRepository } = require('./inmemory/InMemoryCsAgentRepository');
const { InMemoryTechnicianRepository } = require('./inmemory/InMemoryTechnicianRepository');
const { InMemoryServiceRepository } = require('./inmemory/InMemoryServiceRepository');
const { InMemoryProductRepository } = require('./inmemory/InMemoryProductRepository');
const { InMemoryCartRepository } = require('./inmemory/InMemoryCartRepository');
const { InMemoryFavoriteRepository } = require('./inmemory/InMemoryFavoriteRepository');
const { InMemoryInquiryRepository } = require('./inmemory/InMemoryInquiryRepository');
const { InMemoryOrderItemRepository } = require('./inmemory/InMemoryOrderItemRepository');
const { InMemoryPaymentRepository } = require('./inmemory/InMemoryPaymentRepository');
const { InMemoryRefundRepository } = require('./inmemory/InMemoryRefundRepository');
const { InMemoryProfitSharingRepository } = require('./inmemory/InMemoryProfitSharingRepository');
const { InMemoryWorkOrderRepository } = require('./inmemory/InMemoryWorkOrderRepository');
const { InMemoryWorkOrderMessageRepository } = require('./inmemory/InMemoryWorkOrderMessageRepository');
const { InMemoryOrderQueryAdapter } = require('./inmemory/InMemoryOrderQueryAdapter');
const { MockPaymentGateway } = require('./inmemory/MockPaymentGateway');
const { SequenceIdGeneratorAdapter } = require('./inmemory/SequenceIdGeneratorAdapter');
const { createCloudDBClient } = require('./clouddb/CloudDBClient');
const { createCloudDBUnitOfWork } = require('./clouddb/CloudDBUnitOfWork');
const { createCloudDBIdSequenceRepository } = require('./clouddb/CloudDBIdSequenceRepository');
const { createCloudDBAuditLogRepository } = require('./clouddb/CloudDBAuditLogRepository');
const { createCloudDBSystemConfigRepository } = require('./clouddb/CloudDBSystemConfigRepository');
const { createCloudDBCategoryRepository } = require('./clouddb/CloudDBCategoryRepository');
const { createCloudDBUserRepository } = require('./clouddb/CloudDBUserRepository');
const { createCloudDBCustomerRepository } = require('./clouddb/CloudDBCustomerRepository');
const { createCloudDBCsAgentRepository } = require('./clouddb/CloudDBCsAgentRepository');
const { createCloudDBTechnicianRepository } = require('./clouddb/CloudDBTechnicianRepository');
const { createCloudDBServiceRepository } = require('./clouddb/CloudDBServiceRepository');
const { createCloudDBProductRepository } = require('./clouddb/CloudDBProductRepository');
const { createCloudDBCartRepository } = require('./clouddb/CloudDBCartRepository');
const { createCloudDBFavoriteRepository } = require('./clouddb/CloudDBFavoriteRepository');
const { createCloudDBInquiryRepository } = require('./clouddb/CloudDBInquiryRepository');
const { createCloudDBOrderRepository } = require('./clouddb/CloudDBOrderRepository');
const { createCloudDBOrderItemRepository } = require('./clouddb/CloudDBOrderItemRepository');
const { createCloudDBPaymentRepository } = require('./clouddb/CloudDBPaymentRepository');
const { createCloudDBRefundRepository } = require('./clouddb/CloudDBRefundRepository');
const { createCloudDBProfitSharingRepository } = require('./clouddb/CloudDBProfitSharingRepository');
const { createCloudDBWorkOrderRepository } = require('./clouddb/CloudDBWorkOrderRepository');
const { createCloudDBWorkOrderMessageRepository } = require('./clouddb/CloudDBWorkOrderMessageRepository');
const { createCloudDBOrderQueryAdapter } = require('./clouddb/CloudDBOrderQueryAdapter');

module.exports = {
  SystemClockAdapter,
  FixedClockAdapter,
  InMemoryLoggerAdapter,
  InMemoryOrderRepository,
  InMemorySettlementAdapter,
  InMemoryUserRepository,
  createInMemoryUnitOfWork,
  InMemoryIdSequenceRepository,
  InMemoryAuditLogRepository,
  InMemorySystemConfigRepository,
  InMemoryCategoryRepository,
  InMemoryCustomerRepository,
  InMemoryCsAgentRepository,
  InMemoryTechnicianRepository,
  InMemoryServiceRepository,
  InMemoryProductRepository,
  InMemoryCartRepository,
  InMemoryFavoriteRepository,
  InMemoryInquiryRepository,
  InMemoryOrderItemRepository,
  InMemoryPaymentRepository,
  InMemoryRefundRepository,
  InMemoryProfitSharingRepository,
  InMemoryWorkOrderRepository,
  InMemoryWorkOrderMessageRepository,
  InMemoryOrderQueryAdapter,
  MockPaymentGateway,
  SequenceIdGeneratorAdapter,
  createCloudDBClient,
  createCloudDBUnitOfWork,
  createCloudDBIdSequenceRepository,
  createCloudDBAuditLogRepository,
  createCloudDBSystemConfigRepository,
  createCloudDBCategoryRepository,
  createCloudDBUserRepository,
  createCloudDBCustomerRepository,
  createCloudDBCsAgentRepository,
  createCloudDBTechnicianRepository,
  createCloudDBServiceRepository,
  createCloudDBProductRepository,
  createCloudDBCartRepository,
  createCloudDBFavoriteRepository,
  createCloudDBInquiryRepository,
  createCloudDBOrderRepository,
  createCloudDBOrderItemRepository,
  createCloudDBPaymentRepository,
  createCloudDBRefundRepository,
  createCloudDBProfitSharingRepository,
  createCloudDBWorkOrderRepository,
  createCloudDBWorkOrderMessageRepository,
  createCloudDBOrderQueryAdapter,
};
