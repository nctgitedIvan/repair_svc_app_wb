'use strict';

/**
 * 身分模組 Repository 的契約案例（P2b-1）。
 *
 * 同一組 cases 會餵給 InMemory 與 CloudDB 實作。
 * UserRepository 的 `seed` 是測試輔助（不在 Port 契約內），
 * 兩個實作都提供。
 */

const assert = require('node:assert/strict');

const userCases = [
  {
    name: 'seed 後：findByOpenid／findById',
    async run(repo) {
      await repo.seed([
        {
          id: 'u1',
          openid: 'openid-1',
          roleType: 'customer',
          status: 'active',
          technicianId: null,
          regions: [],
          dailyRefundBudget: null,
        },
      ]);

      assert.equal((await repo.findByOpenid('openid-1')).id, 'u1');
      assert.equal((await repo.findById('u1')).openid, 'openid-1');
    },
  },
  {
    name: '找不到 → null',
    async run(repo) {
      assert.equal(await repo.findByOpenid('missing'), null);
      assert.equal(await repo.findById('missing'), null);
    },
  },
  {
    name: 'updateLastLogin 會更新 lastLoginAt',
    async run(repo) {
      await repo.seed([{ id: 'u1', openid: 'openid-1' }]);
      await repo.updateLastLogin('u1', 12345);
      assert.equal((await repo.findById('u1')).lastLoginAt, 12345);
    },
  },
  {
    name: 'roleType／technicianId／regions／dailyRefundBudget 有帶出',
    async run(repo) {
      await repo.seed([
        {
          id: 'u2',
          openid: 'openid-2',
          roleType: 'cs_agent',
          status: 'active',
          technicianId: null,
          regions: ['north'],
          dailyRefundBudget: { date: '2026-10-17', usedCents: 100, limitCents: 20000 },
        },
      ]);
      const user = await repo.findById('u2');
      assert.equal(user.roleType, 'cs_agent');
      assert.deepEqual(user.regions, ['north']);
      assert.deepEqual(user.dailyRefundBudget, {
        date: '2026-10-17',
        usedCents: 100,
        limitCents: 20000,
      });
    },
  },
];

const customerCases = [
  {
    name: 'save／findById／findByUserId',
    async run(repo) {
      await repo.save({
        customerId: 'c1',
        userId: 'u1',
        name: '王小明',
        phone: '13800000000',
        addresses: [
          {
            addressId: 'a1',
            name: '王小明',
            phone: '13800000000',
            province: '廣東省',
            city: '深圳市',
            district: '寶安區',
            detailAddress: '中心路 1 號',
            isDefault: true,
          },
        ],
        defaultAddressId: 'a1',
        createdAt: 1000,
        updatedAt: 1000,
      });

      const byId = await repo.findById('c1');
      assert.equal(byId.name, '王小明');
      assert.equal(byId.addresses.length, 1);
      assert.equal(byId.addresses[0].isDefault, true);

      const byUser = await repo.findByUserId('u1');
      assert.equal(byUser.customerId, 'c1');
    },
  },
  {
    name: '找不到 → null',
    async run(repo) {
      assert.equal(await repo.findById('missing'), null);
      assert.equal(await repo.findByUserId('missing'), null);
    },
  },
  {
    name: '再次 save 會覆蓋',
    async run(repo) {
      await repo.save({ customerId: 'c1', userId: 'u1', name: 'A' });
      await repo.save({ customerId: 'c1', userId: 'u1', name: 'B' });
      assert.equal((await repo.findById('c1')).name, 'B');
    },
  },
  {
    name: '參數不合法 → TypeError',
    async run(repo) {
      await assert.rejects(() => repo.save(null), TypeError);
      await assert.rejects(() => repo.save({ customerId: '', userId: 'u1' }), TypeError);
      await assert.rejects(() => repo.findById(''), TypeError);
    },
  },
];

const csAgentCases = [
  {
    name: 'save／findById／findByUserId',
    async run(repo) {
      await repo.save({
        csAgentId: 'cs1',
        userId: 'u1',
        employeeNo: 'E001',
        name: '客服一號',
        regions: ['north'],
        status: 'active',
        dailyRefundBudget: { date: '2026-10-17', usedCents: 100, limitCents: 20000 },
      });

      assert.equal((await repo.findById('cs1')).employeeNo, 'E001');
      assert.equal((await repo.findByUserId('u1')).csAgentId, 'cs1');
    },
  },
  {
    name: '⚠️ 同日 increment 累加、跨日重設',
    async run(repo) {
      await repo.save({
        csAgentId: 'cs1',
        userId: 'u1',
        dailyRefundBudget: { date: '2026-10-17', usedCents: 100, limitCents: 20000 },
      });

      const sameDay = await repo.incrementDailyRefundUsage({
        csAgentId: 'cs1',
        date: '2026-10-17',
        amountCents: 500,
      });
      assert.deepEqual(sameDay, { date: '2026-10-17', usedCents: 600, limitCents: 20000 });

      const nextDay = await repo.incrementDailyRefundUsage({
        csAgentId: 'cs1',
        date: '2026-10-18',
        amountCents: 300,
      });
      assert.deepEqual(nextDay, { date: '2026-10-18', usedCents: 300, limitCents: 20000 });
    },
  },
  {
    name: '找不到客服 → 錯誤',
    async run(repo) {
      await assert.rejects(
        () =>
          repo.incrementDailyRefundUsage({
            csAgentId: 'missing',
            date: '2026-10-17',
            amountCents: 1,
          }),
        /不存在/,
      );
    },
  },
  {
    name: '參數不合法 → TypeError',
    async run(repo) {
      await assert.rejects(
        () => repo.incrementDailyRefundUsage({ csAgentId: 'cs1', date: 'bad', amountCents: 1 }),
        TypeError,
      );
      await assert.rejects(
        () => repo.incrementDailyRefundUsage({ csAgentId: 'cs1', date: '2026-10-17', amountCents: -1 }),
        TypeError,
      );
    },
  },
];

const technicianCases = [
  {
    name: 'save／findById／findByUserId',
    async run(repo) {
      await repo.save({
        technicianId: 't1',
        userId: 'u1',
        name: '師傅一號',
        phone: '13900000000',
        status: 'approved',
        skillTags: ['空調', '水電'],
        level: 'A',
        approvedAt: 1000,
      });

      const byId = await repo.findById('t1');
      assert.equal(byId.name, '師傅一號');
      assert.deepEqual(byId.skillTags, ['空調', '水電']);
      assert.equal((await repo.findByUserId('u1')).technicianId, 't1');
    },
  },
  {
    name: 'listByStatus 只回該狀態，依名稱排序',
    async run(repo) {
      await repo.save({ technicianId: 't2', userId: 'u2', name: 'B', status: 'approved' });
      await repo.save({ technicianId: 't1', userId: 'u1', name: 'A', status: 'approved' });
      await repo.save({ technicianId: 't3', userId: 'u3', name: 'C', status: 'pending' });

      assert.deepEqual(
        (await repo.listByStatus('approved')).map((t) => t.technicianId),
        ['t1', 't2'],
      );
    },
  },
  {
    name: '再次 save 會覆蓋',
    async run(repo) {
      await repo.save({ technicianId: 't1', userId: 'u1', name: 'A' });
      await repo.save({ technicianId: 't1', userId: 'u1', name: 'B' });
      assert.equal((await repo.findById('t1')).name, 'B');
    },
  },
  {
    name: '參數不合法 → TypeError',
    async run(repo) {
      await assert.rejects(() => repo.save({ technicianId: '', userId: 'u1' }), TypeError);
      await assert.rejects(() => repo.listByStatus(''), TypeError);
    },
  },
];

module.exports = { userCases, customerCases, csAgentCases, technicianCases };
