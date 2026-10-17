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
  CUSTOMERS, CATEGORIES, SERVICES, PRODUCTS, ORDERS, TECHNICIAN_EARNINGS,
  WORK_ORDERS, TECHNICIANS, ADMIN_OVERVIEW,
} from './data';

const DELAY_MS = 120;

const ORDER_STATUS_LABELS = {
  PENDING_PAYMENT: '待付款',
  PAID_PENDING_ASSIGN: '待派單',
  ASSIGNED_PENDING_ACCEPT: '已派單待接單',
  ACCEPTED_PENDING_VISIT: '已接單待上門',
  IN_SERVICE: '服務中',
  PENDING_ACCEPTANCE: '待驗收',
  COMPLETED: '已完成',
  DISPUTED: '爭議中',
  CANCELED_UNPAID: '已取消（未付款）',
  CANCELED_PAID_REFUNDED: '已取消（已退款）',
  VOIDED: '已作廢',
};

function toOrderDto(order) {
  const serviceFeeCents = order.items
    .filter((item) => item.feeType === 'SERVICE_FEE')
    .reduce((sum, item) => sum + item.amountCents, 0);
  const materialFeeCents = order.items
    .filter((item) => item.feeType === 'MATERIAL_FEE')
    .reduce((sum, item) => sum + item.amountCents, 0);

  return {
    orderId: order.orderNo,
    orderNo: order.orderNo,
    status: order.status,
    statusLabel: ORDER_STATUS_LABELS[order.status] || order.status,
    customerId: order.customerId,
    technicianId: order.technicianId || null,
    csAgentId: order.csAgentId || null,
    amounts: {
      serviceFeeCents,
      materialFeeCents,
      totalCents: order.totalCents,
      currency: 'CNY',
    },
    items: order.items,
    address: order.address || '',
    appointmentAt: order.appointmentAt || null,
    createdAt: order.createdAt || null,
    completedAt: order.completedAt || null,
  };
}

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

/**
 * 分類（**兩層**，扁平回傳、帶 `parentId`）。
 *
 * ⚠️ 刻意回傳**全部**（含已停用的分類），讓 UI 必須自己過濾 ——
 *    與 `fetchProducts()` 同一個理由：邊界情況要可見（人工驗收）。
 *    過濾規則在 `utils/catalogView.buildCategoryTree()`，且**有測試**。
 */
export async function fetchCategories() {
  await delay(60);
  return { list: CATEGORIES, total: CATEGORIES.length };
}

export async function fetchServices({ category } = {}) {
  await delay();
  const list = SERVICES.filter((s) => s.isActive && (!category || s.category === category));
  return { list, total: list.length };
}

/**
 * 零件列表。
 *
 * ⚠️ 刻意**回傳全部零件（含下架與缺貨）**，讓 UI 必須自己處理顯示 ——
 *    真實後端會過濾，但 P7a 讓邊界情況可見（人工驗收 C4/C5）。
 */
export async function fetchProducts({ category } = {}) {
  await delay();
  const list = PRODUCTS.filter((p) => !category || p.category === category);
  return { list, total: list.length };
}

export async function fetchProductDetail(productId) {
  await delay();
  const product = PRODUCTS.find((p) => p.productId === productId);
  if (!product) throw new Error('零件不存在：' + productId);
  return product;
}

/**
 * 供購物車 `validate()` 使用的商品現況索引（productId → 庫存/價格/上架）。
 *
 * ⚠️ **P7b 後端契約，目前無人呼叫。**
 *    T4 的購物車改用 `fetchProducts()` 自己建索引 —— 因為畫面也需要名稱與圖片，
 *    分成兩次查詢沒有意義（見 `docs/P7a-2a-T4-計畫.md` §13 Q-3）。
 *    保留它是因為它描述的是**後端應提供的校驗端點**：P7b 接上真後端後，
 *    購物車的「結算前校驗」應該打這支（只回校驗需要的欄位，不搬名稱與圖片）。
 */
export async function fetchProductCatalogIndex() {
  await delay(40);
  const index = {};
  for (const p of PRODUCTS) {
    index[p.productId] = { isActive: p.isActive, stock: p.stock, priceCents: p.priceCents };
  }
  return index;
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
    list: ORDERS.map((order) => ({
      ...toOrderDto(order),
      customer: CUSTOMERS[order.customerId], // 客戶本人可見完整資料
    })),
  };
}

/** 訂單列表（與 fetchMyOrders 同義；頁面層統一用這個名字） */
export const fetchOrders = fetchMyOrders;

/** 目前客戶的個人資料 */
export async function fetchUserProfile() {
  await delay(60);
  const customer = CUSTOMERS['cust-1'];
  return {
    userId: customer.userId,
    nickname: customer.name,
    avatarUrl: '',
    phone: customer.phone,
    role: 'customer',
    customerServicePhone: '400-800-1234',
  };
}

/** 首頁：Banner／公告／快捷入口 */
export async function fetchHome() {
  await delay(60);
  return {
    announcement: '平台試營運中：澳門（+853）與大陸（+86）手機號皆可下單',
    swiper: [
      'https://tdesign.gtimg.com/miniprogram/template/retail/goods/dz-2a.png',
      'https://tdesign.gtimg.com/miniprogram/template/retail/goods/dz-3a.png',
    ],
    quickEntries: [
      { key: 'category', title: '分類', icon: 'app' },
      { key: 'orders', title: '訂單', icon: 'list' },
      { key: 'cart', title: '購物車', icon: 'cart' },
      { key: 'favorites', title: '收藏', icon: 'star' },
    ],
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
