'use strict';

const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');

const {
  users,
  customers,
  technicians,
  services,
  products,
  orders,
  refunds,
  STATUS_LABELS,
} = require('./data');

const app = express();
const PORT = process.env.PORT || 4000;
const JWT_SECRET = process.env.JWT_SECRET || 'repair-admin-mock-secret';
const TOKEN_TTL = '2h';

app.use(cors());
app.use(express.json({ limit: '5mb' }));

function publicUser(user) {
  return {
    id: user.id,
    username: user.username,
    name: user.name,
    roleType: user.roleType,
    status: user.status,
    permissions: user.permissions || [],
  };
}

function signToken(user) {
  return jwt.sign(
    {
      sub: user.id,
      name: user.name,
      role: user.roleType,
      permissions: user.permissions || [],
    },
    JWT_SECRET,
    { expiresIn: TOKEN_TTL },
  );
}

function authRequired(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) return res.status(401).json({ message: '未登入' });

  try {
    req.user = jwt.verify(token, JWT_SECRET);
    return next();
  } catch (err) {
    return res.status(401).json({ message: '登入已過期，請重新登入' });
  }
}

function startOfTodayUtc8() {
  const now = Date.now();
  const shifted = now + 8 * 3_600_000;
  const day = Math.floor(shifted / 86_400_000) * 86_400_000;
  return day - 8 * 3_600_000;
}

function nextId(prefix, list, idField) {
  let n = list.length + 1;
  while (list.some((entry) => entry[idField] === `${prefix}-${n}`)) n += 1;
  return `${prefix}-${n}`;
}

// ── 公開端點 ──

app.get('/api/health', (req, res) => {
  res.json({ ok: true, service: 'repair-admin-mock-server', time: Date.now() });
});

app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body || {};
  const user = users.find(
    (entry) => entry.username === username && entry.password === password && entry.roleType === 'admin',
  );
  if (!user) return res.status(401).json({ message: '帳號或密碼錯誤' });
  if (user.status !== 'active') return res.status(403).json({ message: '帳號已停用' });

  return res.json({ token: signToken(user), user: publicUser(user) });
});

// ── 以下都需要登入 ──
app.use('/api', authRequired);

app.get('/api/auth/me', (req, res) => {
  const user = users.find((entry) => entry.id === req.user.sub);
  if (!user) return res.status(401).json({ message: '使用者不存在' });
  return res.json({ user: publicUser(user) });
});

// ── Dashboard ──
app.get('/api/dashboard/stats', (req, res) => {
  const todayStart = startOfTodayUtc8();
  const todayOrders = orders.filter(
    (order) => order.createdAt >= todayStart && order.status !== 'PENDING_PAYMENT' && order.status !== 'CANCELED_UNPAID',
  );

  res.json({
    todayRevenueCents: todayOrders.reduce((sum, order) => sum + order.amounts.totalCents, 0),
    pendingAssignCount: orders.filter((order) => order.status === 'PAID_PENDING_ASSIGN').length,
    pendingRefundsCount: refunds.filter((refund) => refund.status === 'requested').length,
    userCount: users.filter((user) => user.roleType === 'customer').length,
    recentOrders: orders.slice(0, 5),
  });
});

// ── 商品 ──
app.get('/api/products', (req, res) => {
  res.json({ list: products, total: products.length });
});

app.post('/api/products', (req, res) => {
  const body = req.body || {};
  if (!body.name) return res.status(400).json({ message: '商品名稱必填' });

  const product = {
    productId: nextId('prd', products, 'productId'),
    name: body.name,
    nameEn: body.nameEn || '',
    description: body.description || '',
    detailHtml: body.detailHtml || '',
    category: body.category || '',
    categoryId: body.categoryId || '',
    order: Number.isInteger(body.order) ? body.order : products.length + 1,
    priceCents: Number.isInteger(body.priceCents) ? body.priceCents : 0,
    stock: Number.isInteger(body.stock) ? body.stock : 0,
    specs: Array.isArray(body.specs) ? body.specs : [],
    skus: Array.isArray(body.skus) ? body.skus : [],
    images: Array.isArray(body.images) ? body.images : [],
    isActive: body.isActive !== false,
  };
  products.push(product);
  return res.status(201).json(product);
});

app.put('/api/products/:id', (req, res) => {
  const product = products.find((entry) => entry.productId === req.params.id);
  if (!product) return res.status(404).json({ message: '商品不存在' });

  const body = req.body || {};
  Object.assign(product, {
    name: body.name !== undefined ? body.name : product.name,
    nameEn: body.nameEn !== undefined ? body.nameEn : product.nameEn,
    description: body.description !== undefined ? body.description : product.description,
    detailHtml: body.detailHtml !== undefined ? body.detailHtml : product.detailHtml,
    category: body.category !== undefined ? body.category : product.category,
    categoryId: body.categoryId !== undefined ? body.categoryId : product.categoryId,
    order: Number.isInteger(body.order) ? body.order : product.order,
    priceCents: Number.isInteger(body.priceCents) ? body.priceCents : product.priceCents,
    stock: Number.isInteger(body.stock) ? body.stock : product.stock,
    specs: Array.isArray(body.specs) ? body.specs : product.specs,
    skus: Array.isArray(body.skus) ? body.skus : product.skus,
    images: Array.isArray(body.images) ? body.images : product.images,
    isActive: body.isActive !== undefined ? body.isActive !== false : product.isActive,
  });
  return res.json(product);
});

app.patch('/api/products/:id/status', (req, res) => {
  const product = products.find((entry) => entry.productId === req.params.id);
  if (!product) return res.status(404).json({ message: '商品不存在' });
  product.isActive = req.body && req.body.isActive === true;
  return res.json(product);
});

// ── 服務 ──
app.get('/api/services', (req, res) => {
  res.json({ list: services, total: services.length });
});

app.post('/api/services', (req, res) => {
  const body = req.body || {};
  if (!body.name) return res.status(400).json({ message: '服務名稱必填' });

  const service = {
    serviceId: nextId('svc', services, 'serviceId'),
    name: body.name,
    nameEn: body.nameEn || '',
    description: body.description || '',
    detailHtml: body.detailHtml || '',
    category: body.category || '',
    categoryId: body.categoryId || '',
    order: Number.isInteger(body.order) ? body.order : services.length + 1,
    priceCents: Number.isInteger(body.priceCents) ? body.priceCents : 0,
    durationMinutes: Number.isInteger(body.durationMinutes) ? body.durationMinutes : 60,
    skillTags: Array.isArray(body.skillTags) ? body.skillTags : [],
    images: Array.isArray(body.images) ? body.images : [],
    isActive: body.isActive !== false,
  };
  services.push(service);
  return res.status(201).json(service);
});

app.put('/api/services/:id', (req, res) => {
  const service = services.find((entry) => entry.serviceId === req.params.id);
  if (!service) return res.status(404).json({ message: '服務不存在' });

  const body = req.body || {};
  Object.assign(service, {
    name: body.name !== undefined ? body.name : service.name,
    nameEn: body.nameEn !== undefined ? body.nameEn : service.nameEn,
    description: body.description !== undefined ? body.description : service.description,
    detailHtml: body.detailHtml !== undefined ? body.detailHtml : service.detailHtml,
    category: body.category !== undefined ? body.category : service.category,
    categoryId: body.categoryId !== undefined ? body.categoryId : service.categoryId,
    order: Number.isInteger(body.order) ? body.order : service.order,
    priceCents: Number.isInteger(body.priceCents) ? body.priceCents : service.priceCents,
    durationMinutes: Number.isInteger(body.durationMinutes) ? body.durationMinutes : service.durationMinutes,
    skillTags: Array.isArray(body.skillTags) ? body.skillTags : service.skillTags,
    images: Array.isArray(body.images) ? body.images : service.images,
    isActive: body.isActive !== undefined ? body.isActive !== false : service.isActive,
  });
  return res.json(service);
});

app.patch('/api/services/:id/status', (req, res) => {
  const service = services.find((entry) => entry.serviceId === req.params.id);
  if (!service) return res.status(404).json({ message: '服務不存在' });
  service.isActive = req.body && req.body.isActive === true;
  return res.json(service);
});

// ── 圖片上傳（模擬） ──
app.post('/api/uploads', (req, res) => {
  const { dataUrl, fileName } = req.body || {};
  if (dataUrl && typeof dataUrl === 'string' && dataUrl.startsWith('data:image/')) {
    return res.json({ url: dataUrl, fileName: fileName || 'upload.png' });
  }
  return res.json({
    url: 'https://tdesign.gtimg.com/miniprogram/template/retail/goods/dz-2a.png',
    fileName: fileName || 'placeholder.png',
  });
});

// ── 訂單 ──
app.get('/api/orders', (req, res) => {
  const { status } = req.query;
  const list = status ? orders.filter((order) => order.status === status) : orders;
  res.json({ list, total: list.length });
});

app.get('/api/orders/:id', (req, res) => {
  const order = orders.find((entry) => entry.orderId === req.params.id);
  if (!order) return res.status(404).json({ message: '訂單不存在' });
  return res.json(order);
});

app.post('/api/orders/:id/assign', (req, res) => {
  const order = orders.find((entry) => entry.orderId === req.params.id);
  if (!order) return res.status(404).json({ message: '訂單不存在' });

  const { technicianId } = req.body || {};
  const technician = technicians.find(
    (entry) => entry.technicianId === technicianId && entry.status === 'approved',
  );
  if (!technician) return res.status(400).json({ message: '請選擇已通過審核的師傅' });

  const assignable = ['PAID_PENDING_ASSIGN', 'ASSIGNED_PENDING_ACCEPT'];
  if (!assignable.includes(order.status)) {
    return res.status(409).json({ message: `訂單狀態「${order.statusLabel}」不可派單` });
  }

  order.technicianId = technician.technicianId;
  order.technicianName = technician.name;
  order.status = 'ASSIGNED_PENDING_ACCEPT';
  order.statusLabel = STATUS_LABELS[order.status];
  return res.json(order);
});

// ── 師傅 ──
app.get('/api/technicians', (req, res) => {
  res.json({ list: technicians, total: technicians.length });
});

app.post('/api/technicians/:id/approve', (req, res) => {
  const technician = technicians.find((entry) => entry.technicianId === req.params.id);
  if (!technician) return res.status(404).json({ message: '師傅不存在' });
  if (technician.status !== 'pending') {
    return res.status(409).json({ message: '只有待審核的師傅可以通過審核' });
  }
  technician.status = 'approved';
  technician.approvedAt = Date.now();
  return res.json(technician);
});

app.get('/api/technicians/:id/earnings', (req, res) => {
  const technician = technicians.find((entry) => entry.technicianId === req.params.id);
  if (!technician) return res.status(404).json({ message: '師傅不存在' });

  const records = orders
    .filter(
      (order) =>
        order.technicianId === technician.technicianId && order.status === 'COMPLETED',
    )
    .map((order) => ({
      orderId: order.orderId,
      orderNo: order.orderNo,
      completedAt: order.completedAt,
      serviceFeeCents: order.amounts.serviceFeeCents,
      technicianShareCents: Math.round(order.amounts.serviceFeeCents * 0.8),
    }));

  return res.json({
    technicianId: technician.technicianId,
    technicianName: technician.name,
    totalCents: records.reduce((sum, record) => sum + record.technicianShareCents, 0),
    records,
  });
});

app.use((err, req, res, next) => {
  console.error('[mock-server]', err);
  res.status(500).json({ message: 'Mock Server 錯誤' });
});

app.listen(PORT, () => {
  console.log(`✓ Mock Server: http://localhost:${PORT}`);
  console.log('  登入帳號：admin / admin');
});
