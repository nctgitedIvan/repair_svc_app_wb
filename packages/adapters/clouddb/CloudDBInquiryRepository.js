'use strict';

const { toRow, fromRow } = require('./mappers/inquiry');

/** CloudDBInquiryRepository —— `inquiries` 的雲端實作（只寫不跑）。 */
function createCloudDBInquiryRepository({ client, uow } = {}) {
  if (!client || typeof client.collection !== 'function') {
    throw new TypeError('CloudDBInquiryRepository 需要 CloudDBClient');
  }
  if (!uow || typeof uow.run !== 'function') {
    throw new TypeError('CloudDBInquiryRepository 需要 UnitOfWork');
  }

  const collection = () => client.collection('inquiries');

  return {
    async create(inquiry) {
      if (!inquiry || typeof inquiry !== 'object') {
        throw new TypeError('Inquiry.create(inquiry) 需要物件');
      }
      assertString(inquiry.inquiryId, 'inquiryId');
      assertString(inquiry.customerId, 'customerId');
      assertString(inquiry.productId, 'productId');
      await collection().doc(inquiry.inquiryId).set({ data: toRow(inquiry) });
    },

    async findById(inquiryId) {
      assertString(inquiryId, 'inquiryId');
      try {
        const snapshot = await collection().doc(inquiryId).get();
        return snapshot && snapshot.data ? fromRow({ ...snapshot.data, _id: inquiryId }) : null;
      } catch (err) {
        if (isNotFound(err)) return null;
        throw err;
      }
    },

    async listByCustomer(customerId) {
      assertString(customerId, 'customerId');
      const result = await collection()
        .where({ customer_id: customerId })
        .orderBy('created_at', 'desc')
        .limit(200)
        .get();
      return (result && Array.isArray(result.data) ? result.data : []).map(fromRow);
    },

    async listPending() {
      const result = await collection()
        .where({ status: 'pending' })
        .orderBy('created_at', 'asc')
        .limit(200)
        .get();
      return (result && Array.isArray(result.data) ? result.data : []).map(fromRow);
    },

    async appendReply(inquiryId, reply) {
      assertString(inquiryId, 'inquiryId');
      if (!reply || typeof reply !== 'object') {
        throw new TypeError('appendReply 需要 reply 物件');
      }

      return uow.run(async (tx) => {
        const ref = tx.collection('inquiries').doc(inquiryId);
        const snapshot = await ref.get();
        if (!snapshot || !snapshot.data) throw new Error(`詢問不存在：${inquiryId}`);

        const current = fromRow({ ...snapshot.data, _id: inquiryId });
        const replies = [...current.replies, reply];
        await ref.update({
          data: {
            replies: replies.map((item) => ({
              actor_id: item.actorId || null,
              actor_role: item.actorRole || null,
              body: item.body || '',
              created_at: Number.isInteger(item.createdAt) ? item.createdAt : null,
            })),
            status: 'replied',
            cs_agent_id: reply.actorId || current.csAgentId || null,
          },
        });
        return { ...current, replies, status: 'replied', csAgentId: reply.actorId || current.csAgentId || null };
      });
    },

    async close(inquiryId, { csAgentId } = {}) {
      assertString(inquiryId, 'inquiryId');
      return uow.run(async (tx) => {
        const ref = tx.collection('inquiries').doc(inquiryId);
        const snapshot = await ref.get();
        if (!snapshot || !snapshot.data) throw new Error(`詢問不存在：${inquiryId}`);

        const current = fromRow({ ...snapshot.data, _id: inquiryId });
        const next = {
          ...current,
          status: 'closed',
          csAgentId: csAgentId || current.csAgentId || null,
        };
        await ref.update({ data: { status: 'closed', cs_agent_id: next.csAgentId } });
        return next;
      });
    },
  };
}

function assertString(value, name) {
  if (typeof value !== 'string' || value.length === 0) {
    throw new TypeError(`${name} 必須是非空字串`);
  }
}
function isNotFound(err) {
  const text = `${(err && err.errCode) || ''} ${(err && err.code) || ''} ${
    (err && err.message) || ''
  }`.toLowerCase();
  return text.includes('not exist') || text.includes('not found') || text.includes('does not exist');
}

module.exports = { createCloudDBInquiryRepository };
