'use strict';

const crypto = require('crypto');

/**
 * Mock 資料 —— 形狀刻意對齊 P2 的 Ports／Schema：
 * - services / products：docs/01 §7.4（camelCase，images、specs、skus）
 * - orders：OrderRepository 的 DTO（amounts、items、status）
 * - technicians：TechnicianRepository
 * - users／refunds：P2 集合的讀模型
 *
 * ⚠️ 全部是記憶體資料；重啟 server 會回到初始狀態。
 */

function sha256(text) {
  return crypto.createHash('sha256').update(String(text)).digest('hex');
}

/**
 * admin_credentials —— 後台管理員帳密（Mock）。
 *
 * 正式版由 `admin-api` 的 users／權限組決定；密碼應使用 scrypt／bcrypt，
 * 且 refresh token 放 HttpOnly Cookie（見 docs/01 §4.9）。
 */
const adminCredentials = [
  {
    id: 'admin-1',
    username: 'admin',
    passwordHash: sha256('admin'),
    name: '超級管理員',
    roleType: 'admin',
    status: 'active',
    permissions: ['admin.full'],
    failedAttempts: 0,
    lockedUntil: null,
    lastLoginAt: null,
  },
];

const STATUS_LABELS = {
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

const DAY = 86_400_000;
const now = Date.now();

const users = [
  {
    id: 'admin-1',
    username: 'admin',
    password: 'admin',
    name: '超級管理員',
    roleType: 'admin',
    status: 'active',
    permissions: ['admin.full'],
  },
  { id: 'u-cust-1', name: '王小明', roleType: 'customer', status: 'active' },
  { id: 'u-cust-2', name: '陳小華', roleType: 'customer', status: 'active' },
  { id: 'u-tech-1', name: '王師傅', roleType: 'technician', status: 'active' },
  { id: 'u-tech-2', name: '李師傅', roleType: 'technician', status: 'active' },
  { id: 'u-tech-3', name: '陳師傅', roleType: 'technician', status: 'active' },
];

const customers = [
  { customerId: 'cust-1', userId: 'u-cust-1', name: '王小明', phone: '13812345678' },
  { customerId: 'cust-2', userId: 'u-cust-2', name: '陳小華', phone: '13987654321' },
];

const technicians = [
  {
    technicianId: 'tech-1',
    userId: 'u-tech-1',
    name: '王師傅',
    phone: '+8613700001111',
    status: 'approved',
    skillTags: ['空調', '冷凍空調'],
    level: 'A',
    earningsCents: 328000,
    approvedAt: now - 120 * DAY,
  },
  {
    technicianId: 'tech-2',
    userId: 'u-tech-2',
    name: '李師傅',
    phone: '+85366123456',
    status: 'pending',
    skillTags: ['水電', '給排水'],
    level: 'B',
    earningsCents: 0,
    approvedAt: null,
  },
  {
    technicianId: 'tech-3',
    userId: 'u-tech-3',
    name: '陳師傅',
    phone: '+8613700003333',
    status: 'approved',
    skillTags: ['家具', '組裝'],
    level: 'B',
    earningsCents: 156000,
    approvedAt: now - 60 * DAY,
  },
];

const categories = [
  { categoryId: 'cat_ac', name: '空調', parentId: null, order: 1, isActive: true },
  { categoryId: 'cat_water', name: '水', parentId: null, order: 2, isActive: true },
  { categoryId: 'cat_elec', name: '電', parentId: null, order: 3, isActive: true },
  { categoryId: 'cat_furn', name: '家具', parentId: null, order: 4, isActive: true },
  { categoryId: 'cat_ac_repair', name: '維修', parentId: 'cat_ac', order: 1, isActive: true },
  { categoryId: 'cat_ac_clean', name: '清洗', parentId: 'cat_ac', order: 2, isActive: true },
  { categoryId: 'cat_water_pipe', name: '水管', parentId: 'cat_water', order: 1, isActive: true },
  { categoryId: 'cat_water_faucet', name: '水龍頭', parentId: 'cat_water', order: 2, isActive: true },
  { categoryId: 'cat_elec_light', name: '燈具', parentId: 'cat_elec', order: 1, isActive: true },
  { categoryId: 'cat_furn_assembly', name: '組裝', parentId: 'cat_furn', order: 1, isActive: true },
];

const services = [
  {
    serviceId: 'svc-1',
    name: '冷氣維修',
    nameEn: 'AC Repair',
    description: '到府檢修冷氣，含基本檢測與清潔',
    detailHtml: '<p>到府檢修冷氣。</p><p><strong>流程：</strong>電話確認 → 到府檢測 → 報價 → 維修 → 驗收。</p>',
    category: '空調',
    categoryId: 'cat_ac_repair',
    order: 1,
    priceCents: 10000,
    durationMinutes: 60,
    skillTags: ['空調', '冷凍空調'],
    images: ['https://tdesign.gtimg.com/miniprogram/template/retail/goods/dz-2a.png'],
    isActive: true,
  },
  {
    serviceId: 'svc-2',
    name: '冷氣清洗',
    nameEn: 'AC Cleaning',
    description: '深度清洗室內機與濾網',
    detailHtml: '<p>深度清洗室內機與濾網。</p>',
    category: '空調',
    categoryId: 'cat_ac_clean',
    order: 1,
    priceCents: 6000,
    durationMinutes: 45,
    skillTags: ['空調', '清洗'],
    images: ['https://tdesign.gtimg.com/miniprogram/template/retail/goods/dz-2b.png'],
    isActive: true,
  },
  {
    serviceId: 'svc-3',
    name: '水管疏通',
    nameEn: 'Drain Unclogging',
    description: '廚房與浴室排水管疏通',
    detailHtml: '<p>使用電動疏通機具，不通不收費。</p>',
    category: '水',
    categoryId: 'cat_water_pipe',
    order: 1,
    priceCents: 8000,
    durationMinutes: 40,
    skillTags: ['水電', '給排水'],
    images: ['https://tdesign.gtimg.com/miniprogram/template/retail/goods/dz-3a.png'],
    isActive: true,
  },
  {
    serviceId: 'svc-4',
    name: '水龍頭安裝',
    nameEn: 'Faucet Installation',
    description: '含舊品拆除與新品安裝、試水',
    detailHtml: '<p>含舊品拆除與新品安裝、試水。</p>',
    category: '水',
    categoryId: 'cat_water_faucet',
    order: 1,
    priceCents: 5000,
    durationMinutes: 30,
    skillTags: ['水電', '衛浴'],
    images: ['https://tdesign.gtimg.com/miniprogram/template/retail/goods/dz-3b.png'],
    isActive: false,
  },
];

const products = [
  {
    productId: 'prd-1',
    name: '冷媒 R410',
    nameEn: 'Refrigerant R410',
    description: '適用 R410A 系統',
    detailHtml: '<p>適用 R410A 系統。</p>',
    category: '空調',
    categoryId: 'cat_ac_repair',
    order: 1,
    priceCents: 2500,
    stock: 20,
    specs: [{ specId: 'size', title: '規格', values: ['標準罐', '大罐'] }],
    skus: [
      { skuId: 'sku-std', specValues: ['標準罐'], priceCents: 2500, stock: 20, image: 'https://tdesign.gtimg.com/miniprogram/template/retail/goods/dz-2a.png' },
      { skuId: 'sku-big', specValues: ['大罐'], priceCents: 4800, stock: 8, image: 'https://tdesign.gtimg.com/miniprogram/template/retail/goods/dz-2b.png' },
    ],
    images: ['https://tdesign.gtimg.com/miniprogram/template/retail/goods/dz-2a.png'],
    isActive: true,
  },
  {
    productId: 'prd-2',
    name: '排水管接頭',
    nameEn: 'Drain Pipe Connector',
    description: '通用型 PVC 接頭',
    detailHtml: '<p>適用多數家用排水管徑。</p>',
    category: '水',
    categoryId: 'cat_water_pipe',
    order: 1,
    priceCents: 800,
    stock: 3,
    specs: [],
    skus: [],
    images: ['https://tdesign.gtimg.com/miniprogram/template/retail/goods/dz-3a.png'],
    isActive: true,
  },
  {
    productId: 'prd-3',
    name: '溫控器',
    nameEn: 'Thermostat',
    description: '已停產的舊款溫控器',
    detailHtml: '<p>僅供既有系統維修替換。</p>',
    category: '電',
    categoryId: 'cat_elec_light',
    order: 2,
    priceCents: 12000,
    stock: 0,
    specs: [],
    skus: [],
    images: ['https://tdesign.gtimg.com/miniprogram/template/retail/goods/dz-4a.png'],
    isActive: false,
  },
  {
    productId: 'prd-4',
    name: '冷氣濾網',
    nameEn: 'AC Filter',
    description: '可裁剪的通用濾網',
    detailHtml: '<p>建議每 3 個月更換一次。</p>',
    category: '空調',
    categoryId: 'cat_ac_clean',
    order: 2,
    priceCents: 450,
    stock: 30,
    specs: [],
    skus: [],
    images: ['https://tdesign.gtimg.com/miniprogram/template/retail/goods/dz-4b.png'],
    isActive: true,
  },
];

function orderItem(itemType, name, spec, unitPriceCents, quantity, feeType) {
  return {
    itemType,
    itemRefId: itemType === 'product' ? 'prd-1' : 'svc-1',
    nameSnapshot: name,
    specSnapshot: spec || '',
    unitPriceCents,
    currency: 'CNY',
    quantity,
    feeType,
  };
}

function makeOrder({
  orderId,
  orderNo,
  status,
  customer,
  technicianId = null,
  items,
  createdAt,
  address,
}) {
  const serviceFeeCents = items
    .filter((item) => item.feeType === 'SERVICE_FEE')
    .reduce((sum, item) => sum + item.unitPriceCents * item.quantity, 0);
  const materialFeeCents = items
    .filter((item) => item.feeType === 'MATERIAL_FEE')
    .reduce((sum, item) => sum + item.unitPriceCents * item.quantity, 0);
  const technician = technicians.find((entry) => entry.technicianId === technicianId);

  return {
    orderId,
    orderNo,
    status,
    statusLabel: STATUS_LABELS[status] || status,
    customerId: customer.customerId,
    customerName: customer.name,
    customerPhone: customer.phone,
    technicianId,
    technicianName: technician ? technician.name : null,
    amounts: {
      serviceFeeCents,
      materialFeeCents,
      totalCents: serviceFeeCents + materialFeeCents,
      currency: 'CNY',
    },
    items,
    address,
    appointmentAt: createdAt + DAY,
    createdAt,
    completedAt: status === 'COMPLETED' ? createdAt + 2 * DAY : null,
  };
}

const orders = [
  makeOrder({
    orderId: 'order-1',
    orderNo: 'R20261017000001',
    status: 'PAID_PENDING_ASSIGN',
    customer: customers[0],
    items: [
      orderItem('service', '冷氣維修', '標準清洗', 10000, 1, 'SERVICE_FEE'),
      orderItem('product', '冷媒 R410', '大罐', 4800, 1, 'MATERIAL_FEE'),
    ],
    createdAt: now - 3 * 3_600_000,
    address: '廣東省深圳市寶安區沙井街道中心路 28 號',
  }),
  makeOrder({
    orderId: 'order-2',
    orderNo: 'R20261017000002',
    status: 'ASSIGNED_PENDING_ACCEPT',
    customer: customers[1],
    technicianId: 'tech-1',
    items: [orderItem('service', '冷氣清洗', '', 6000, 1, 'SERVICE_FEE')],
    createdAt: now - 5 * 3_600_000,
    address: '廣東省深圳市南山區科技園 1 號',
  }),
  makeOrder({
    orderId: 'order-3',
    orderNo: 'R20261016000003',
    status: 'COMPLETED',
    customer: customers[0],
    technicianId: 'tech-1',
    items: [orderItem('service', '水管疏通', '', 8000, 1, 'SERVICE_FEE')],
    createdAt: now - 30 * 3_600_000,
    address: '廣東省深圳市寶安區沙井街道中心路 28 號',
  }),
  makeOrder({
    orderId: 'order-4',
    orderNo: 'R20261017000004',
    status: 'PENDING_PAYMENT',
    customer: customers[1],
    items: [orderItem('product', '排水管接頭', '', 800, 2, 'MATERIAL_FEE')],
    createdAt: now - 1 * 3_600_000,
    address: '廣東省深圳市南山區科技園 1 號',
  }),
  makeOrder({
    orderId: 'order-5',
    orderNo: 'R20261017000005',
    status: 'PENDING_ACCEPTANCE',
    customer: customers[0],
    technicianId: 'tech-3',
    items: [orderItem('service', '家具組裝', '', 12000, 1, 'SERVICE_FEE')],
    createdAt: now - 8 * 3_600_000,
    address: '廣東省深圳市寶安區沙井街道中心路 28 號',
  }),
];

const refunds = [
  {
    refundId: 'refund-1',
    orderId: 'order-3',
    outRefundNo: 'RF2026101600000301',
    amountCents: 3000,
    currency: 'CNY',
    status: 'requested',
    reason: '服務不符預期',
    requestedBy: 'u-cust-1',
    requestedAt: now - 2 * 3_600_000,
  },
];

const profitSharingRecords = [
  {
    sharingId: 'sharing-order-3',
    orderId: 'order-3',
    orderNo: 'R20261016000003',
    technicianId: 'tech-1',
    technicianName: '王師傅',
    amountCents: 6400,
    currency: 'CNY',
    status: 'success',
    createdAt: now - 24 * 3_600_000,
  },
];

/**
 * 權限組（與 packages/domain/access/PermissionGroupMatrix.js 對齊的簡化版）。
 * 後台「權限管理」頁只用來顯示與 Mock 調整。
 */
const permissionGroups = {
  'admin.full': [
    'orders.read_all', 'orders.assign', 'refunds.approve_large', 'settlement.execute',
    'catalog.manage', 'technicians.manage', 'users.manage_role', 'audit.read',
  ],
  'admin.finance': ['orders.read_all', 'refunds.approve_small', 'refunds.approve_large', 'settlement.execute', 'audit.read'],
  'admin.operations': ['orders.read_all', 'orders.assign', 'catalog.manage', 'technicians.manage', 'settlement.execute'],
  'admin.support': ['orders.read_all', 'orders.assign', 'refunds.approve_small'],
};

const adminAccounts = [
  {
    id: 'admin-1',
    username: 'admin',
    name: '超級管理員',
    status: 'active',
    permissionGroups: ['admin.full'],
    lastLoginAt: null,
  },
];

/**
 * 優惠券（P8 Mock）。
 *
 * 形狀對齊 `packages/ports/CouponRepository`／`UserCouponRepository`；
 * 正式版由 `admin-api` 寫入 `coupons`／`user_coupons` 集合。
 */
const coupons = [
  {
    couponId: 'coupon-1',
    name: '新客立減 20 元',
    amountCents: 2000,
    minSpendCents: 5000,
    validFrom: now - 7 * DAY,
    validTo: now + 30 * DAY,
    isActive: true,
    totalQuantity: null,
    createdAt: now - 7 * DAY,
  },
  {
    couponId: 'coupon-2',
    name: '滿 100 減 15',
    amountCents: 1500,
    minSpendCents: 10000,
    validFrom: now - 3 * DAY,
    validTo: now + 14 * DAY,
    isActive: true,
    totalQuantity: null,
    createdAt: now - 3 * DAY,
  },
];

const userCoupons = [
  {
    userCouponId: 'uc-1',
    couponId: 'coupon-1',
    userId: 'u-cust-1',
    status: 'unused',
    validFrom: coupons[0].validFrom,
    validTo: coupons[0].validTo,
    receivedAt: now - 5 * DAY,
    usedAt: null,
    orderId: null,
  },
];

module.exports = {
  STATUS_LABELS,
  adminCredentials,
  sha256,
  users,
  customers,
  technicians,
  categories,
  services,
  products,
  orders,
  refunds,
  profitSharingRecords,
  permissionGroups,
  adminAccounts,
  coupons,
  userCoupons,
};
