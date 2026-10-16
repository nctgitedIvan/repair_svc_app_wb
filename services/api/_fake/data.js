/**
 * P7a 的假資料。
 *
 * ⚠️⚠️ **這些資料「刻意過度完整」。**
 *
 *    師傅端的訂單**故意帶完整客戶姓名、手機、完整門牌**。
 *    目的是讓「師傅端不得顯示敏感資料」變成**可目視驗收的事實** ——
 *    若 UI 不小心把這些欄位渲染出來，一眼就看得到。
 *
 *    若這裡只放脫敏後的資料，那個驗收就形同虛設
 *    （UI 就算直接印出 `customer.phone` 也看不出問題）。
 *
 *    P7b 接上真實後端後，後端本來就只會回傳脫敏資料；
 *    這裡的「過度完整」是**前端端的壓力測試**，不是真實契約。
 *
 * 形狀以 `docs/01-目標架構.md` 的 DTO 規格為準。
 *
 * ⚠️ 本檔用 CommonJS，讓 `tests/unit/frontend/fakeData.test.js` 能驗證
 *    「它確實含完整敏感資料」—— 這個驗證是為了保護上述的驗收設計。
 */

const CUSTOMERS = Object.freeze({
  'cust-1': {
    userId: 'cust-1',
    name: '王小明', // ← 完整姓名（師傅端只能看到「王」）
    phone: '13812345678', // ← 完整手機（師傅端只能看到 138****5678）
    address: {
      province: '廣東省',
      city: '深圳市',
      district: '寶安區',
      street: '沙井街道',
      detailAddress: '中心路28號麗沙花都3棟5B', // ← 完整門牌（師傅端服務當日前不得見）
    },
  },
});

const SERVICES = Object.freeze([
  {
    serviceId: 'svc-1',
    name: '冷氣維修',
    category: '空調',
    priceCents: 10000,
    durationMinutes: 60,
    description: '到府檢修冷氣，含基本檢測與清潔',
    isActive: true,
  },
  {
    serviceId: 'svc-2',
    name: '冷氣清洗',
    category: '空調',
    priceCents: 6000,
    durationMinutes: 45,
    description: '深度清洗室內機與濾網',
    isActive: true,
  },
  {
    serviceId: 'svc-3',
    name: '水管疏通',
    category: '水電',
    priceCents: 8000,
    durationMinutes: 40,
    description: '廚房與浴室排水管疏通',
    isActive: true,
  },
]);

/**
 * 零件（商品）。
 *
 * ⚠️ 依 §3.7.1，零件與服務在領域層分離：
 *    零件有 `stock` 與 `specs`，服務沒有。
 *
 * 形狀對齊後端（`docs/01` §7.1 的 `products`），讓 P7b 換實作時無痛。
 *
 * `stock` 刻意設得小（含 0 與不足的量），讓 §3.7.6 的邊界情況
 * **可被目視驗收**（人工驗收 P7a2a-C4）。
 *
 * `thumb` 是給前端呈現用的圖片欄位（購物車列、商品列表、商品詳情共用）。
 * ⚠️ **後端 `products` 的圖片欄位尚未在 `docs/01` §7.1 定名** ——
 *    這裡用 `thumb` 是配合既有呈現元件（`goods-card`）的期待值，
 *    **P2 建立集合時要一併定案**（見 `docs/01` §7.2 第 7 點之後的未決項說明）。
 */
const PRODUCTS = Object.freeze([
  {
    productId: 'prd-1',
    name: '冷媒 R410',
    category: '冷媒',
    priceCents: 2500,
    stock: 20,
    isActive: true,
    thumb: 'https://tdesign.gtimg.com/miniprogram/template/retail/goods/nz-09a.png',
    specs: [{ specId: 'std', name: '標準罐' }, { specId: 'big', name: '大罐' }],
  },
  {
    productId: 'prd-2',
    name: '排水管接頭',
    category: '管件',
    priceCents: 800,
    stock: 3, // ← 刻意很少，驗收「庫存不足」用
    isActive: true,
    thumb: 'https://tdesign.gtimg.com/miniprogram/template/retail/goods/dz-3a.png',
    specs: [],
  },
  {
    productId: 'prd-3',
    name: '濾網（通用型）',
    category: '耗材',
    priceCents: 450,
    stock: 0, // ← 刻意為 0，驗收「已售完」用
    isActive: true,
    thumb: 'https://tdesign.gtimg.com/miniprogram/template/retail/goods/muy-3a.png',
    specs: [],
  },
  {
    productId: 'prd-4',
    name: '舊款溫控器',
    category: '零件',
    priceCents: 3200,
    stock: 5,
    isActive: false, // ← 刻意下架，驗收「已下架」用
    thumb: 'https://tdesign.gtimg.com/miniprogram/template/retail/goods/nz-17a.png',
    specs: [],
  },
]);

/**
 * 訂單。**刻意同時提供「師傅視角」與「完整資料」**，
 * 讓同一個訂單在客戶／客服／師傅端呈現不同欄位。
 */
const ORDERS = Object.freeze([
  {
    orderNo: 'R20261016000001',
    status: 'ASSIGNED_PENDING_ACCEPT', // 值 30
    customerId: 'cust-1',
    technicianId: 'tech-1',
    csAgentId: 'cs-1',
    appointmentAt: Date.parse('2026-10-20T06:00:00Z'),
    totalCents: 12500,
    items: [
      { itemType: 'service', nameSnapshot: '冷氣維修', amountCents: 10000, feeType: 'SERVICE_FEE' },
      { itemType: 'product', nameSnapshot: '冷媒 R410', amountCents: 2500, feeType: 'MATERIAL_FEE' },
    ],
  },
  {
    orderNo: 'R20261016000002',
    status: 'COMPLETED', // 值 70
    customerId: 'cust-1',
    technicianId: 'tech-1',
    csAgentId: 'cs-1',
    appointmentAt: Date.parse('2026-10-18T02:00:00Z'),
    completedAt: Date.parse('2026-10-18T04:00:00Z'),
    totalCents: 6000,
    items: [{ itemType: 'service', nameSnapshot: '冷氣清洗', amountCents: 6000, feeType: 'SERVICE_FEE' }],
  },
]);

/** 師傅的報酬。**不含分潤比例**（Q-E：比例是談判籌碼，不得公開） */
const TECHNICIAN_EARNINGS = Object.freeze([
  {
    orderNo: 'R20261016000002',
    amountCents: 4800,
    sharingStatus: 'SHARED', // 凍結中 / 已分帳 / 已回退
    settledAt: Date.parse('2026-10-18T05:00:00Z'),
  },
  {
    orderNo: 'R20261016000001',
    amountCents: 8000,
    sharingStatus: 'FROZEN',
    settledAt: null,
  },
]);

const WORK_ORDERS = Object.freeze([
  {
    ticketId: 'tk-1',
    orderNo: 'R20261016000001',
    status: 'OPEN',
    lastMessage: '請問師傅大概幾點到？',
    lastMessageAt: Date.parse('2026-10-19T01:00:00Z'),
    messages: [
      { senderRole: 'customer', content: '請問師傅大概幾點到？', at: Date.parse('2026-10-19T01:00:00Z') },
      { senderRole: 'cs_agent', content: '已為您確認，師傅預計下午兩點到。', at: Date.parse('2026-10-19T01:05:00Z') },
    ],
  },
]);

const TECHNICIANS = Object.freeze([
  { technicianId: 'tech-1', userId: 'u-tech-1', displayName: '陳師傅', regionCode: '440306', status: 'AVAILABLE' },
  { technicianId: 'tech-2', userId: 'u-tech-2', displayName: '林師傅', regionCode: '440306', status: 'BUSY' },
]);

/** 管理員手機概覽（Q-C） */
const ADMIN_OVERVIEW = Object.freeze({
  todayOrderCount: 12,
  pendingAssignCount: 3,
  pendingRefundCount: 1,
  todayRevenueCents: 45600,
});

module.exports = {
  CUSTOMERS,
  SERVICES,
  PRODUCTS,
  ORDERS,
  TECHNICIAN_EARNINGS,
  WORK_ORDERS,
  TECHNICIANS,
  ADMIN_OVERVIEW,
};
