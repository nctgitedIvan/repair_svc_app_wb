'use strict';

/**
 * 工單的共用小工具。
 *
 * 工單主檔在支付成功後建立（每訂單一張）；後續狀態流轉只追加訊息。
 * 沒有注入 repo 時靜默跳過。
 */

function ticketIdOf(orderId) {
  return `ticket-${orderId}`;
}

async function ensureWorkOrderTicket({ workOrderRepository, orderId, at, csAgentId = null }) {
  if (!workOrderRepository) return null;
  const ticketId = ticketIdOf(orderId);
  const existing = await workOrderRepository.findByOrderId(orderId);
  if (existing) return existing;

  const ticket = {
    ticketId,
    orderId,
    status: 'open',
    csAgentId,
    createdAt: at,
    updatedAt: at,
  };
  await workOrderRepository.save(ticket);
  return ticket;
}

async function appendWorkOrderMessage({
  workOrderRepository,
  workOrderMessageRepository,
  orderId,
  actor,
  body,
  at,
  messageId,
}) {
  if (!workOrderMessageRepository) return null;
  // 沒有工單就不寫訊息（例如尚未付款）
  if (workOrderRepository) {
    const ticket = await workOrderRepository.findByOrderId(orderId);
    if (!ticket) return null;
  }

  const message = {
    messageId: messageId || `msg-${orderId}-${at}`,
    ticketId: ticketIdOf(orderId),
    actorId: actor.id,
    actorRole: actor.role,
    body,
    createdAt: at,
  };
  await workOrderMessageRepository.append(message);
  return message;
}

module.exports = { ticketIdOf, ensureWorkOrderTicket, appendWorkOrderMessage };
