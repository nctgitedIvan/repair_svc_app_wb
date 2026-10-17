'use strict';

const { ConcurrencyConflict } = require('@repair/shared-kernel/Errors');
const { Order } = require('@repair/domain/order/Order');
const { toRow, toRehydrateInput } = require('./mappers/order');
const { fromRow: itemFromRow } = require('./mappers/orderItem');
const { fromRow: logFromRow } = require('./mappers/orderStatusLog');

/**
 * CloudDBOrderRepository —— 訂單聚合的雲端實作（只寫不跑）。
 *
 * 底層：`orders`＋`order_items`＋`order_status_logs`。
 * 樂觀鎖：現存版本的 `version` 必須等於 `order.version - 1`。
 *
 * ⚠️ 雲開發事務只允許單記錄操作；`save()` 以 `doc().get/set` 完成，
 *    操作數 = 1（訂單）＋ 明細數 ＋ 歷程數，必須 ≤100。
 */
function createCloudDBOrderRepository({ client, uow } = {}) {
  if (!client || typeof client.collection !== 'function') {
    throw new TypeError('CloudDBOrderRepository 需要 CloudDBClient');
  }
  if (!uow || typeof uow.run !== 'function') {
    throw new TypeError('CloudDBOrderRepository 需要 UnitOfWork');
  }

  const orders = () => client.collection('orders');
  const items = () => client.collection('order_items');
  const logs = () => client.collection('order_status_logs');

  async function hydrateById(orderId) {
    let snapshot;
    try {
      snapshot = await orders().doc(orderId).get();
    } catch (err) {
      if (isNotFound(err)) return null;
      throw err;
    }
    if (!snapshot || !snapshot.data) return null;
    return hydrateRow({ ...snapshot.data, _id: orderId });
  }

  async function hydrateRow(row) {
    const [itemResult, logResult] = await Promise.all([
      items().where({ order_id: row._id }).orderBy('item_index', 'asc').limit(100).get(),
      logs().where({ order_id: row._id }).orderBy('log_index', 'asc').limit(100).get(),
    ]);
    const itemRows = (itemResult && Array.isArray(itemResult.data) ? itemResult.data : []).map(itemFromRow);
    const logRows = (logResult && Array.isArray(logResult.data) ? logResult.data : []).map(logFromRow);
    return Order.rehydrate(toRehydrateInput(row, itemRows, logRows));
  }

  return {
    async findById(orderId) {
      assertString(orderId, 'orderId');
      return hydrateById(orderId);
    },

    async findByOrderNo(orderNo) {
      assertString(orderNo, 'orderNo');
      const result = await orders().where({ order_no: orderNo }).limit(1).get();
      const row = result && Array.isArray(result.data) ? result.data[0] : null;
      return row ? hydrateRow(row) : null;
    },

    async save(order, { expectedVersion } = {}) {
      if (!order || typeof order.id !== 'string') {
        throw new TypeError('OrderRepository.save(order) 需要 Order 聚合');
      }

      const data = order.toPersistence();
      const itemRows = data.items;
      const logRows = data.timeline;

      await uow.run(async (tx) => {
        const ref = tx.collection('orders').doc(order.id);
        let existing = null;
        try {
          const snapshot = await ref.get();
          existing = snapshot && snapshot.data ? snapshot.data : null;
        } catch (err) {
          if (!isNotFound(err)) throw err;
        }

        // 樂觀鎖：優先比對呼叫端載入時的版本
        if (existing) {
          const expected = Number.isInteger(expectedVersion)
            ? expectedVersion
            : order.version - 1;
          if (existing.version !== expected) {
            throw new ConcurrencyConflict('orders', expected, existing.version);
          }
        }

        await ref.set({ data: toRow(order) });

        for (let index = 0; index < itemRows.length; index += 1) {
          await tx
            .collection('order_items')
            .doc(`${order.id}:item:${index}`)
            .set({ data: toOrderItemRow(itemRows[index], order.id, index) });
        }

        for (let index = 0; index < logRows.length; index += 1) {
          await tx
            .collection('order_status_logs')
            .doc(`${order.id}:log:${index}`)
            .set({ data: toOrderLogRow(logRows[index], order.id, index) });
        }
      });
    },

    async findExpiredUnpaid(beforeTimestamp, limit) {
      assertInteger(beforeTimestamp, 'beforeTimestamp');
      assertInteger(limit, 'limit');
      const command = client.command();
      const result = await orders()
        .where({ status: 10, created_at: command.lt(beforeTimestamp) })
        .limit(limit)
        .get();
      return hydrateMany(result);
    },

    async findExpiredUnassigned(beforeTimestamp, limit) {
      assertInteger(beforeTimestamp, 'beforeTimestamp');
      assertInteger(limit, 'limit');
      const command = client.command();
      const result = await orders()
        .where({ status: command.in([20, 30]), created_at: command.lt(beforeTimestamp) })
        .limit(limit)
        .get();
      return hydrateMany(result);
    },
  };

  async function hydrateMany(result) {
    const rows = result && Array.isArray(result.data) ? result.data : [];
    const hydrated = [];
    for (const row of rows) {
      hydrated.push(await hydrateRow(row));
    }
    return hydrated;
  }
}

function toOrderItemRow(item, orderId, index) {
  return {
    order_id: orderId,
    item_index: index,
    item_type: item.itemType,
    item_ref_id: item.itemRefId,
    name_snapshot: item.nameSnapshot,
    spec_snapshot: item.specSnapshot || '',
    unit_price_cents: item.unitPriceCents,
    currency: item.currency,
    quantity: item.quantity,
    fee_type: item.feeType,
    commission_rate_bp_snapshot: item.commissionRateBpSnapshot,
  };
}

function toOrderLogRow(log, orderId, index) {
  return {
    order_id: orderId,
    log_index: index,
    from_key: log.fromKey,
    to_key: log.toKey,
    actor_id: log.actorId,
    actor_role: log.actorRole,
    at: log.at,
    reason: log.reason || null,
  };
}

function assertString(value, name) {
  if (typeof value !== 'string' || value.length === 0) {
    throw new TypeError(`${name} 必須是非空字串`);
  }
}
function assertInteger(value, name) {
  if (!Number.isInteger(value)) throw new TypeError(`${name} 必須是整數`);
}
function isNotFound(err) {
  const text = `${(err && err.errCode) || ''} ${(err && err.code) || ''} ${
    (err && err.message) || ''
  }`.toLowerCase();
  return text.includes('not exist') || text.includes('not found') || text.includes('does not exist');
}

module.exports = { createCloudDBOrderRepository };
