'use strict';

/**
 * 測試用的依賴容器工廠。
 *
 * 全部使用 in-memory 替身 —— 這是「domain 與 application 可在完全不啟動
 * 微信雲環境下被測試」的具體落實。
 *
 * 本檔屬 tests/，check-layering 會跳過（測試需要 new adapter 的能力）。
 */

const {
  InMemoryOrderRepository,
  InMemoryUserRepository,
  InMemorySettlementAdapter,
  FixedClockAdapter,
  InMemoryLoggerAdapter,
} = require('../../packages/adapters');

/** 測試用的固定時間：2023-11-15T06:13:20Z（讓測試可重現） */
const FIXED_NOW = 1_700_000_000_000;

function buildTestContainer(overrides = {}) {
  return {
    orderRepository: new InMemoryOrderRepository(),
    userRepository: new InMemoryUserRepository(),
    settlementGateway: new InMemorySettlementAdapter(),
    clock: new FixedClockAdapter(FIXED_NOW),
    logger: new InMemoryLoggerAdapter(),
    ...overrides,
  };
}

/** 常用的測試使用者 */
const TEST_USERS = {
  customer: { id: 'u-cust', openid: 'openid-cust', roleType: 'customer', status: 'active' },
  csAgent: { id: 'u-cs', openid: 'openid-cs', roleType: 'cs_agent', status: 'active', regions: ['440306'] },
  technician: {
    id: 'u-tech', openid: 'openid-tech', roleType: 'technician', status: 'active', technicianId: 'tech-1',
  },
  admin: { id: 'u-admin', openid: 'openid-admin', roleType: 'admin', status: 'active' },
  disabled: { id: 'u-off', openid: 'openid-off', roleType: 'technician', status: 'disabled' },
};

module.exports = { buildTestContainer, TEST_USERS, FIXED_NOW };
