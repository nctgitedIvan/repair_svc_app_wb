'use strict';

/**
 * ContactChannelPolicy —— 師傅↔客戶的聯繫通道。
 *
 * 師傅**永遠拿不到客戶的真實號碼**。要聯絡客戶只有兩條路：
 *
 * | 通道 | 前提 | 回傳給師傅的號碼 |
 * |---|---|---|
 * | `AXB_VIRTUAL_NUMBER` | 已開通隱私號服務 | **中間號**（雙方互不見號碼） |
 * | `CS_THREE_WAY_CALL` | 客服在線 | **客服的號碼** |
 * | （皆不可用） | — | **拒絕**，提示稍後再試 |
 *
 * **降級順序**：AXB → 三方通話 → 拒絕。
 *
 * ⚠️ 本政策只決定「用哪條通道」，**不產生號碼** ——
 *    實際號碼由 `ContactChannelPort` 的 adapter 提供（可能是外部的隱私號服務）。
 *
 * 對應 docs/01 §3.4、§6.4、A2。
 */

const ContactChannel = Object.freeze({
  AXB_VIRTUAL_NUMBER: 'AXB_VIRTUAL_NUMBER',
  CS_THREE_WAY_CALL: 'CS_THREE_WAY_CALL',
});

const ChannelDecision = Object.freeze({
  USE_AXB: 'USE_AXB',
  USE_CS_THREE_WAY: 'USE_CS_THREE_WAY',
  DENIED_NO_CHANNEL: 'DENIED_NO_CHANNEL',
  DENIED_NOT_ASSIGNED: 'DENIED_NOT_ASSIGNED',
});

/**
 * @param {object} params
 * @param {{ id: string, role: string, technicianId?: string }} params.viewer
 * @param {object} params.order 需含 `technicianId`
 * @param {{ axbAvailable?: boolean, csOnline?: boolean }} [params.channelCapabilities]
 * @returns {{ decision: string, channel: string|null, reason: string|null }}
 */
function resolveChannel({ viewer, order, channelCapabilities = {} }) {
  // ① 只有「被指派的師傅」能發起聯絡
  if (!viewer || viewer.role !== 'technician' || !viewer.technicianId) {
    return deny(ChannelDecision.DENIED_NOT_ASSIGNED, '只有師傅可以發起與客戶的聯繫');
  }
  if (!order || order.technicianId !== viewer.technicianId) {
    return deny(ChannelDecision.DENIED_NOT_ASSIGNED, '只能聯繫自己被指派訂單的客戶');
  }

  const { axbAvailable = false, csOnline = false } = channelCapabilities;

  // ② 首選：AXB 虛擬號（雙方互不見號碼）
  if (axbAvailable) {
    return { decision: ChannelDecision.USE_AXB, channel: ContactChannel.AXB_VIRTUAL_NUMBER, reason: null };
  }

  // ③ 退而求其次：客服三方通話
  if (csOnline) {
    return { decision: ChannelDecision.USE_CS_THREE_WAY, channel: ContactChannel.CS_THREE_WAY_CALL, reason: null };
  }

  // ④ 都不行 → 拒絕（**不**退化為提供客戶號碼）
  return deny(
    ChannelDecision.DENIED_NO_CHANNEL,
    '目前無法建立聯繫通道（虛擬號未開通且客服不在線），請稍後再試或改用客服工單',
  );
}

function deny(decision, reason) {
  return { decision, channel: null, reason };
}

module.exports = { resolveChannel, ContactChannel, ChannelDecision };
