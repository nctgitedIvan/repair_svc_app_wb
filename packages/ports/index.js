'use strict';

/**
 * @repair/ports —— 介面定義。
 *
 * 本層只有契約，沒有任何實作（由 scripts/check-layering.js 檢查：不得出現 `new`）。
 * 方向：adapters 實作本層；application 依賴本層；本層依賴 domain 與 shared-kernel。
 */

const { ClockPort } = require('./ClockPort');
const { IdGeneratorPort } = require('./IdGeneratorPort');
const { LoggerPort } = require('./LoggerPort');
const { OrderRepository } = require('./OrderRepository');
const { UserRepository } = require('./UserRepository');
const { UnitOfWork, UnitOfWorkTransaction } = require('./UnitOfWork');
const { SettlementGateway, SettlementMode, SettlementStatus } = require('./SettlementGateway');
const { IdSequenceRepository } = require('./IdSequenceRepository');
const { AuditLogRepository } = require('./AuditLogRepository');
const { SystemConfigRepository } = require('./SystemConfigRepository');
const { CategoryRepository } = require('./CategoryRepository');
const { CustomerRepository } = require('./CustomerRepository');
const { CsAgentRepository } = require('./CsAgentRepository');
const { TechnicianRepository } = require('./TechnicianRepository');

module.exports = {
  ClockPort,
  IdGeneratorPort,
  LoggerPort,
  OrderRepository,
  UserRepository,
  UnitOfWork,
  UnitOfWorkTransaction,
  SettlementGateway,
  SettlementMode,
  SettlementStatus,
  IdSequenceRepository,
  AuditLogRepository,
  SystemConfigRepository,
  CategoryRepository,
  CustomerRepository,
  CsAgentRepository,
  TechnicianRepository,
};
