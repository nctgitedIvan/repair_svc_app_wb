/**
 * Fake API 實作（P7a 用）。
 *
 * 讓前端 UI 能在 **P5（Use Case）完成之前**開發與驗收。
 * P7b 會把 `config.apiMode` 切到 `'cloud'`，改走 `services/api/real/`。
 *
 * ⚠️ 這裡回傳的資料**刻意包含完整敏感欄位**（見 `data.js`），
 *    用來驗證「師傅端 UI 不會顯示它們」。
 *
 * 所有方法都回傳 Promise，形狀與真實 API 一致 —— 這樣 P7b 換實作時
 * UI 完全不用改。
 */

import {
  CUSTOMERS, SERVICES, PRODUCTS, ORDERS, TECHNICIAN_EARNINGS,
  WORK_ORDERS, TECHNICIANS, ADMIN_OVERVIEW,
} from './data';

const DELAY_MS = 120;

/** 模擬網路延遲，讓載入狀態真的會出現（否則 UI 的 loading 永遠測不到） */
function delay(ms = DELAY_MS) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** 目前假裝登入的角色。P7a 要驗收四種角色的介面，可直接改這裡。 */
let currentRole = 'customer';

/** 測試輔助：切換角色以檢視不同介面 */
export function __setRoleForDemo(role) {
  currentRole = role;
}

export async function getMyRole() {
  await delay(60);
  return { role: currentRole, status: 'active' };
}

export async function fetchServices({ category } = {}) {
  await delay();
  const list = SERVICES.filter((s) => s.isActive && (!category || s.category === category));
  return { list, total: list.length };
}

export async function fetchServiceDetail(serviceId) {
  await delay();
  const service = SERVICES.find((s) => s.serviceId === serviceId);
  if (!service) throw new Error(`服務不存在：${serviceId}`);
  return { service, products: PRODUCTS.filter((p) => p.isActive) };
}

/**
 * 客戶視角的訂單列表 —— **含完整客戶資料**（客戶看自己的資料是合理的）。
 */
export async function fetchMyOrders() {
  await delay();
  return {
    list: ORDERS.map((o) => ({
      ...o,
      customer: CUSTOMERS[o.customerId], // 客戶本人可見完整資料
    })),
  };
}

export async function fetchOrderDetail(orderNo) {
  await delay();
  const order = ORDERS.find((o) => o.orderNo === orderNo);
  if (!order) throw new Error(`訂單不存在：${orderNo}`);
  return { ...order, customer: CUSTOMERS[order.customerId] };
}

/**
 * 師傅視角的任務列表。
 *
 * ⚠️ **刻意回傳完整客戶資料**，讓 UI 必須自己避免渲染它們。
 *    真實後端會直接回脫敏資料；這裡是**前端端的壓力測試**。
 */
export async function fetchTechnicianTasks() {
  await delay();
  const mine = ORDERS.filter((o) => o.technicianId === 'tech-1');
  return {
    list: mine.map((o) => ({
      ...o,
      customer: CUSTOMERS[o.customerId], // ← 完整姓名／手機／門牌
    })),
  };
}

/** 師傅報酬。**不含分潤比例與平台抽成**（Q-E） */
export async function fetchTechnicianEarnings() {
  await delay();
  const totalCents = TECHNICIAN_EARNINGS.reduce((s, e) => s + e.amountCents, 0);
  return { list: TECHNICIAN_EARNINGS, totalCents };
}

/** 客服派單工作台 —— 客服可見完整客戶資料 */
export async function fetchCsWorkbench() {
  await delay();
  return {
    pendingAssign: ORDERS.filter((o) => o.status === 'PAID_PENDING_ASSIGN').map((o) => ({
      ...o,
      customer: CUSTOMERS[o.customerId],
    })),
    technicians: TECHNICIANS,
    // 注意：假資料目前沒有待派單的訂單，P7a-2 驗收時可調整 data.js
    all: ORDERS.map((o) => ({ ...o, customer: CUSTOMERS[o.customerId] })),
  };
}

export async function fetchWorkOrders() {
  await delay();
  return { list: WORK_ORDERS };
}

export async function fetchWorkOrderDetail(ticketId) {
  await delay();
  const ticket = WORK_ORDERS.find((t) => t.ticketId === ticketId);
  if (!ticket) throw new Error(`工單不存在：${ticketId}`);
  return ticket;
}

/** 管理員手機概覽（Q-C：只讀，操作一律在 Web 後台） */
export async function fetchAdminOverview() {
  await delay();
  return { ...ADMIN_OVERVIEW };
}
