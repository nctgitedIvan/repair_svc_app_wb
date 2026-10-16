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

/**
 * 分類（**兩層**，`parentId === null` 為一級）。
 *
 * ⚠️ T3.6 起改為**二級分類**（原「不做二級分類」的決策已修正，
 *    見 `docs/01` §3.7.9 的修正註記）。
 *
 * | 一級 | 二級 |
 * |---|---|
 * | 水 | 水管／水龍頭／熱水器 |
 * | 電 | 線路／插座／燈具 |
 * | 空調 | 清洗／維修／安裝 |
 * | 家具 | 組裝／維修 |
 *
 * `order` 是同層的顯示順序；`isActive` 為 false 時整個分類不顯示
 * （後台可上下架，`docs/01` §3.7.9）。
 *
 * ⚠️ 刻意**只放實際用到的欄位**：`docs/01` §3.7.9 的形狀還有 `icon`，
 *    但目前的佈局（`isSlotRight`）只渲染名稱，`icon` 等到後台分類管理（P8）再定。
 */
const CATEGORIES = Object.freeze([
  // ── 一級 ──
  { categoryId: 'cat_water', name: '水', parentId: null, order: 1, isActive: true },
  { categoryId: 'cat_elec', name: '電', parentId: null, order: 2, isActive: true },
  { categoryId: 'cat_ac', name: '空調', parentId: null, order: 3, isActive: true },
  { categoryId: 'cat_furn', name: '家具', parentId: null, order: 4, isActive: true },

  // ── 二級：水 ──
  { categoryId: 'cat_water_pipe', name: '水管', parentId: 'cat_water', order: 1, isActive: true },
  { categoryId: 'cat_water_faucet', name: '水龍頭', parentId: 'cat_water', order: 2, isActive: true },
  { categoryId: 'cat_water_heater', name: '熱水器', parentId: 'cat_water', order: 3, isActive: true },

  // ── 二級：電 ──
  { categoryId: 'cat_elec_wire', name: '線路', parentId: 'cat_elec', order: 1, isActive: true },
  { categoryId: 'cat_elec_socket', name: '插座', parentId: 'cat_elec', order: 2, isActive: true },
  { categoryId: 'cat_elec_light', name: '燈具', parentId: 'cat_elec', order: 3, isActive: true },

  // ── 二級：空調 ──
  { categoryId: 'cat_ac_clean', name: '清洗', parentId: 'cat_ac', order: 1, isActive: true },
  { categoryId: 'cat_ac_repair', name: '維修', parentId: 'cat_ac', order: 2, isActive: true },
  { categoryId: 'cat_ac_install', name: '安裝', parentId: 'cat_ac', order: 3, isActive: true },

  // ── 二級：家具 ──
  { categoryId: 'cat_furn_assembly', name: '組裝', parentId: 'cat_furn', order: 1, isActive: true },
  { categoryId: 'cat_furn_repair', name: '維修', parentId: 'cat_furn', order: 2, isActive: true },

  // ── 刻意停用一個分類，讓「下架分類不顯示」可被目視驗收 ──
  { categoryId: 'cat_old', name: '舊家電（已停用）', parentId: null, order: 9, isActive: false },
]);

/**
 * 服務（人工）。
 *
 * ⚠️ 兩個分類欄位的分工（T3.6 起）：
 *   - `category`   ：**一級**分類的**名稱**（字串，供 `fetchServices({ category })` 篩選）
 *   - `categoryId` ：**二級**分類的 id（分類頁的關聯，與 `products` 一致）
 *
 * 每個二級分類至少掛一個服務或零件，否則該 tab 會是空的
 * （空的分類是合法狀態，但不利於驗收 —— 只留一個「已停用」的分類當反例）。
 */
const SERVICES = Object.freeze([
  {
    serviceId: 'svc-1',
    name: '冷氣維修',
    category: '空調',
    categoryId: 'cat_ac_repair',
    order: 1,
    priceCents: 10000,
    durationMinutes: 60,
    description: '到府檢修冷氣，含基本檢測與清潔',
    isActive: true,
    thumb: 'https://tdesign.gtimg.com/miniprogram/template/retail/goods/muy-3a.png',
  },
  {
    serviceId: 'svc-2',
    name: '冷氣清洗',
    category: '空調',
    categoryId: 'cat_ac_clean',
    order: 1,
    priceCents: 6000,
    durationMinutes: 45,
    description: '深度清洗室內機與濾網',
    isActive: true,
    thumb: 'https://tdesign.gtimg.com/miniprogram/template/retail/goods/nz-17a.png',
  },
  {
    serviceId: 'svc-3',
    name: '水管疏通',
    category: '水', // T3.6：原本是「水電」，改為一級分類「水」以維持欄位語意一致
    categoryId: 'cat_water_pipe',
    order: 1,
    priceCents: 8000,
    durationMinutes: 40,
    description: '廚房與浴室排水管疏通',
    isActive: true,
    thumb: 'https://tdesign.gtimg.com/miniprogram/template/retail/goods/dz-3a.png',
  },
  {
    serviceId: 'svc-4',
    name: '水龍頭安裝',
    category: '水',
    categoryId: 'cat_water_faucet',
    order: 1,
    priceCents: 5000,
    durationMinutes: 30,
    description: '含舊品拆除與新品安裝、試水',
    isActive: true,
    thumb: 'https://tdesign.gtimg.com/miniprogram/template/retail/goods/nz-09a.png',
  },
  {
    serviceId: 'svc-5',
    name: '熱水器清洗',
    category: '水',
    categoryId: 'cat_water_heater',
    order: 1,
    priceCents: 7000,
    durationMinutes: 45,
    description: '清除水垢與沉積物，含安全檢查',
    isActive: true,
    thumb: 'https://tdesign.gtimg.com/miniprogram/template/retail/goods/nz-08b.png',
  },
  {
    serviceId: 'svc-6',
    name: '線路檢修',
    category: '電',
    categoryId: 'cat_elec_wire',
    order: 1,
    priceCents: 9000,
    durationMinutes: 60,
    description: '查線、測漏電、更換老化線路',
    isActive: true,
    thumb: 'https://tdesign.gtimg.com/miniprogram/template/retail/goods/nz-17a.png',
  },
  {
    serviceId: 'svc-7',
    name: '插座更換',
    category: '電',
    categoryId: 'cat_elec_socket',
    order: 1,
    priceCents: 3000,
    durationMinutes: 30,
    description: '更換面板與插座本體，含通電測試',
    isActive: true,
    thumb: 'https://tdesign.gtimg.com/miniprogram/template/retail/goods/dz-3a.png',
  },
  {
    serviceId: 'svc-8',
    name: '燈具安裝',
    category: '電',
    categoryId: 'cat_elec_light',
    order: 1,
    priceCents: 4000,
    durationMinutes: 40,
    description: '吸頂燈／吊燈安裝，含舊燈拆除',
    isActive: true,
    thumb: 'https://tdesign.gtimg.com/miniprogram/template/retail/goods/muy-3a.png',
  },
  {
    serviceId: 'svc-9',
    name: '冷氣安裝',
    category: '空調',
    categoryId: 'cat_ac_install',
    order: 1,
    priceCents: 12000,
    durationMinutes: 90,
    description: '分離式冷氣標準安裝（不含加長管線）',
    isActive: true,
    thumb: 'https://tdesign.gtimg.com/miniprogram/template/retail/goods/nz-09a.png',
  },
  {
    serviceId: 'svc-10',
    name: '家具組裝',
    category: '家具',
    categoryId: 'cat_furn_assembly',
    order: 1,
    priceCents: 6000,
    durationMinutes: 60,
    description: '櫃體／桌椅到府組裝',
    isActive: true,
    thumb: 'https://tdesign.gtimg.com/miniprogram/template/retail/goods/nz-08b.png',
  },
  {
    serviceId: 'svc-11',
    name: '家具維修',
    category: '家具',
    categoryId: 'cat_furn_repair',
    order: 1,
    priceCents: 8000,
    durationMinutes: 60,
    description: '鬆動、刮傷、五金更換',
    isActive: true,
    thumb: 'https://tdesign.gtimg.com/miniprogram/template/retail/goods/muy-3a.png',
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
 *    **P2 建立集合時要一併定案**（見 `docs/01` §7.2 的未決項說明）。
 *
 * `category`／`categoryId`／`order`：與 `SERVICES` 同一套規則（T3.6 起）——
 * `category` 是一級分類的**名稱**、`categoryId` 指向**二級**分類、`order` 是同分類內的顯示序。
 *
 * ⚠️ **T4 的四種邊界情況必須維持可觸發**（人工驗收 C4/C5 的前提）：
 *    · 庫存很少 → `prd-2`（stock 3）
 *    · 已售完   → `prd-3`（stock 0）
 *    · 已下架   → `prd-4`（isActive false）
 *    · 價格變動 → 手工改任一筆的 `priceCents` 即可
 *    T3.6 只**新增** `categoryId`／`order`／`prd-5~7`，**沒有動這四筆的 stock 與 isActive**。
 */
const PRODUCTS = Object.freeze([
  {
    productId: 'prd-1',
    name: '冷媒 R410',
    category: '空調',
    categoryId: 'cat_ac_repair',
    order: 1,
    priceCents: 2500,
    stock: 20,
    isActive: true,
    thumb: 'https://tdesign.gtimg.com/miniprogram/template/retail/goods/nz-09a.png',
    specs: [{ specId: 'std', name: '標準罐' }, { specId: 'big', name: '大罐' }],
  },
  {
    productId: 'prd-2',
    name: '排水管接頭',
    category: '水',
    categoryId: 'cat_water_pipe',
    order: 1,
    priceCents: 800,
    stock: 3, // ← 刻意很少，驗收「庫存不足」用
    isActive: true,
    thumb: 'https://tdesign.gtimg.com/miniprogram/template/retail/goods/dz-3a.png',
    specs: [],
  },
  {
    productId: 'prd-3',
    name: '濾網（通用型）',
    category: '空調',
    categoryId: 'cat_ac_clean',
    order: 1,
    priceCents: 450,
    stock: 0, // ← 刻意為 0，驗收「已售完」用
    isActive: true,
    thumb: 'https://tdesign.gtimg.com/miniprogram/template/retail/goods/muy-3a.png',
    specs: [],
  },
  {
    productId: 'prd-4',
    name: '舊款溫控器',
    category: '電',
    categoryId: 'cat_elec_socket',
    order: 1,
    priceCents: 3200,
    stock: 5,
    isActive: false, // ← 刻意下架，驗收「已下架」用（分類頁也不會顯示它）
    thumb: 'https://tdesign.gtimg.com/miniprogram/template/retail/goods/nz-17a.png',
    specs: [],
  },
  {
    productId: 'prd-5',
    name: '水龍頭墊片',
    category: '水',
    categoryId: 'cat_water_faucet',
    order: 1,
    priceCents: 200,
    stock: 50,
    isActive: true,
    thumb: 'https://tdesign.gtimg.com/miniprogram/template/retail/goods/dz-3a.png',
    specs: [{ specId: 'm12', name: 'M12' }, { specId: 'm15', name: 'M15' }],
  },
  {
    productId: 'prd-6',
    name: '燈泡（LED 12W）',
    category: '電',
    categoryId: 'cat_elec_light',
    order: 1,
    priceCents: 1500,
    stock: 12,
    isActive: true,
    thumb: 'https://tdesign.gtimg.com/miniprogram/template/retail/goods/nz-17a.png',
    specs: [{ specId: 'warm', name: '暖光' }, { specId: 'cool', name: '白光' }],
  },
  {
    productId: 'prd-7',
    name: '家具五金配件包',
    category: '家具',
    categoryId: 'cat_furn_assembly',
    order: 1,
    priceCents: 600,
    stock: 30,
    isActive: true,
    thumb: 'https://tdesign.gtimg.com/miniprogram/template/retail/goods/nz-08b.png',
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
  CATEGORIES,
  SERVICES,
  PRODUCTS,
  ORDERS,
  TECHNICIAN_EARNINGS,
  WORK_ORDERS,
  TECHNICIANS,
  ADMIN_OVERVIEW,
};
