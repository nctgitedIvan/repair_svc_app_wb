'use strict';

/** 金流與工單 Repository 契約案例（P2c-2）。 */

const assert = require('node:assert/strict');

const paymentCases = [
  {
    name: 'save／findByOutTradeNo／listByOrderId',
    async run(repo) {
      await repo.save({
        paymentId: 'pay1',
        orderId: 'o1',
        outTradeNo: 'T1',
        transactionId: null,
        amountCents: 10000,
        currency: 'CNY',
        status: 'prepay',
        prepayAt: 1000,
        paidAt: null,
        createdAt: 1000,
      });

      assert.equal((await repo.findByOutTradeNo('T1')).paymentId, 'pay1');
      assert.equal((await repo.listByOrderId('o1')).length, 1);
      assert.equal(await repo.findByOutTradeNo('missing'), null);
    },
  },
  {
    name: '更新狀態（同 paymentId）',
    async run(repo) {
      await repo.save({ paymentId: 'pay1', orderId: 'o1', outTradeNo: 'T1', status: 'prepay' });
      await repo.save({ paymentId: 'pay1', orderId: 'o1', outTradeNo: 'T1', status: 'paid' });
      assert.equal((await repo.findByOutTradeNo('T1')).status, 'paid');
    },
  },
  {
    name: '⚠️ outTradeNo 唯一',
    async run(repo) {
      await repo.save({ paymentId: 'pay1', orderId: 'o1', outTradeNo: 'T1' });
      await assert.rejects(
        () => repo.save({ paymentId: 'pay2', orderId: 'o2', outTradeNo: 'T1' }),
        /重複/,
      );
    },
  },
  {
    name: '參數不合法 → TypeError',
    async run(repo) {
      await assert.rejects(() => repo.save(null), TypeError);
      await assert.rejects(() => repo.save({ paymentId: '', orderId: 'o1', outTradeNo: 'T1' }), TypeError);
      await assert.rejects(() => repo.findByOutTradeNo(''), TypeError);
    },
  },
];

const refundCases = [
  {
    name: 'save／findByOutRefundNo／listByOrderId',
    async run(repo) {
      await repo.save({
        refundId: 'r1',
        orderId: 'o1',
        outRefundNo: 'RF1',
        amountCents: 500,
        currency: 'CNY',
        status: 'requested',
        reason: '服務不符',
        requestedAt: 1000,
        processedAt: null,
        createdAt: 1000,
      });

      assert.equal((await repo.findByOutRefundNo('RF1')).refundId, 'r1');
      assert.equal((await repo.listByOrderId('o1')).length, 1);
    },
  },
  {
    name: '⚠️ outRefundNo 唯一',
    async run(repo) {
      await repo.save({ refundId: 'r1', orderId: 'o1', outRefundNo: 'RF1' });
      await assert.rejects(
        () => repo.save({ refundId: 'r2', orderId: 'o2', outRefundNo: 'RF1' }),
        /重複/,
      );
    },
  },
  {
    name: '參數不合法 → TypeError',
    async run(repo) {
      await assert.rejects(() => repo.save(null), TypeError);
      await assert.rejects(() => repo.findByOutRefundNo(''), TypeError);
    },
  },
];

const sharingCases = [
  {
    name: 'save／findByOutOrderNo／listByOrderId',
    async run(repo) {
      await repo.save({
        sharingId: 's1',
        orderId: 'o1',
        outOrderNo: 'SO1',
        technicianId: 't1',
        amountCents: 8000,
        currency: 'CNY',
        status: 'pending',
        providerId: null,
        createdAt: 1000,
        updatedAt: 1000,
      });

      assert.equal((await repo.findByOutOrderNo('SO1')).sharingId, 's1');
      assert.equal((await repo.listByOrderId('o1')).length, 1);
    },
  },
  {
    name: '⚠️ outOrderNo 唯一',
    async run(repo) {
      await repo.save({ sharingId: 's1', orderId: 'o1', outOrderNo: 'SO1' });
      await assert.rejects(
        () => repo.save({ sharingId: 's2', orderId: 'o2', outOrderNo: 'SO1' }),
        /重複/,
      );
    },
  },
  {
    name: 'saveReturn／listReturnsByOrderId',
    async run(repo) {
      await repo.saveReturn({
        returnId: 'ret1',
        orderId: 'o1',
        outOrderNo: 'SO1',
        amountCents: 8000,
        currency: 'CNY',
        status: 'pending',
        createdAt: 1000,
      });
      assert.equal((await repo.listReturnsByOrderId('o1')).length, 1);
    },
  },
  {
    name: '參數不合法 → TypeError',
    async run(repo) {
      await assert.rejects(() => repo.save(null), TypeError);
      await assert.rejects(() => repo.saveReturn(null), TypeError);
      await assert.rejects(() => repo.listReturnsByOrderId(''), TypeError);
    },
  },
];

const workOrderCases = [
  {
    name: 'save／findByOrderId／listByStatus',
    async run(repo) {
      await repo.save({
        ticketId: 't1',
        orderId: 'o1',
        status: 'open',
        csAgentId: 'cs1',
        createdAt: 1000,
        updatedAt: 1000,
      });
      await repo.save({
        ticketId: 't2',
        orderId: 'o2',
        status: 'closed',
        csAgentId: null,
        createdAt: 2000,
        updatedAt: 2000,
      });

      assert.equal((await repo.findByOrderId('o1')).ticketId, 't1');
      assert.deepEqual((await repo.listByStatus('open')).map((t) => t.ticketId), ['t1']);
    },
  },
  {
    name: '⚠️ 每訂單只能一張工單',
    async run(repo) {
      await repo.save({ ticketId: 't1', orderId: 'o1', status: 'open' });
      await assert.rejects(
        () => repo.save({ ticketId: 't2', orderId: 'o1', status: 'open' }),
        /重複/,
      );
    },
  },
  {
    name: '參數不合法 → TypeError',
    async run(repo) {
      await assert.rejects(() => repo.save(null), TypeError);
      await assert.rejects(() => repo.findByOrderId(''), TypeError);
      await assert.rejects(() => repo.listByStatus(''), TypeError);
    },
  },
];

const workOrderMessageCases = [
  {
    name: 'append／listByTicketId（依 createdAt 升序）',
    async run(repo) {
      await repo.append({
        messageId: 'm2',
        ticketId: 't1',
        actorId: 'u2',
        actorRole: 'cs_agent',
        body: '第二則',
        createdAt: 2000,
      });
      await repo.append({
        messageId: 'm1',
        ticketId: 't1',
        actorId: 'u1',
        actorRole: 'customer',
        body: '第一則',
        createdAt: 1000,
      });

      assert.deepEqual((await repo.listByTicketId('t1')).map((m) => m.messageId), ['m1', 'm2']);
    },
  },
  {
    name: '⚠️ messageId 重複 → 錯誤',
    async run(repo) {
      await repo.append({ messageId: 'm1', ticketId: 't1', body: 'a', createdAt: 1 });
      await assert.rejects(
        () => repo.append({ messageId: 'm1', ticketId: 't1', body: 'b', createdAt: 2 }),
        /重複/,
      );
    },
  },
  {
    name: '參數不合法 → TypeError',
    async run(repo) {
      await assert.rejects(() => repo.append(null), TypeError);
      await assert.rejects(() => repo.listByTicketId(''), TypeError);
    },
  },
];

module.exports = {
  paymentCases,
  refundCases,
  sharingCases,
  workOrderCases,
  workOrderMessageCases,
};
