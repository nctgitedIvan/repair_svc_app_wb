# 維修服務平台 · Web 管理後台（P8 第一階段）

> 獨立的 React + Vite + Ant Design 5 專案，與小程序的 `npm run verify` **完全隔離**。
> Mock Server 的資料形狀對齊 P2 的 Ports／Schema（User／Order／Product／Service／Technician）。

## 目錄

```
admin-web/
├── src/                 # React 前端
│   ├── api/client.js    # axios + JWT 攔截器
│   ├── layouts/         # 管理後台版面
│   ├── pages/           # 登入／Dashboard／商品／服務／訂單／師傅
│   └── utils/format.js  # 金額與狀態顯示
├── mock-server/         # Node + Express Mock API
│   ├── index.js
│   └── data.js          # 22 集合形狀的簡化讀模型
└── package.json
```

## 啟動

```bash
cd admin-web
npm install

# 終端機 1：Mock Server（http://localhost:4000）
npm run mock

# 終端機 2：前端（http://localhost:5173）
npm run dev
```

登入帳號：**admin / admin**（Mock JWT，`localStorage` 保存 2 小時）。

> 若只想獨立啟動 Mock Server：
> `cd admin-web/mock-server && npm install && npm start`
> （在 `admin-web` 根目錄已 `npm install` 時，`npm run mock` 也會直接使用上層 node_modules。）

## 已實作頁面

| 頁面 | 功能 |
|---|---|
| 登入 | 帳密登入、JWT、401 自動清除 session |
| Dashboard | 今日營業額、待派單、待審退款、註冊用戶、最近訂單 |
| 商品管理 | 列表、新增／編輯、上下架、價格、**規格維度＋SKU 編輯**、圖片上傳模擬 |
| 服務管理 | 列表、新增／編輯、上下架、價格、時長、技能標籤、圖片上傳模擬 |
| 訂單管理 | 全部訂單、詳情 Drawer（明細／金額／地址）、**客服手動指派師傅** |
| 師傅管理 | 列表、入駐審核、收益 Drawer |

## Mock API（節錄）

| Method | Path | 說明 |
|---|---|---|
| POST | `/api/auth/login` | admin/admin → JWT |
| GET | `/api/auth/me` | 目前使用者 |
| GET | `/api/dashboard/stats` | 統計卡片 |
| GET/POST/PUT | `/api/products`、`/api/products/:id` | 商品 CRUD |
| PATCH | `/api/products/:id/status` | 上下架 |
| GET/POST/PUT | `/api/services`、`/api/services/:id` | 服務 CRUD |
| PATCH | `/api/services/:id/status` | 上下架 |
| POST | `/api/uploads` | 圖片上傳模擬（回傳 data URL 或佔位圖） |
| GET | `/api/orders`、`/api/orders/:id` | 訂單列表／詳情 |
| POST | `/api/orders/:id/assign` | 指派師傅 |
| GET | `/api/technicians` | 師傅列表 |
| POST | `/api/technicians/:id/approve` | 通過入駐審核 |
| GET | `/api/technicians/:id/earnings` | 收益明細 |

## 資料對齊

- 商品：`productId`／`images[]`／`specs[{specId,title,values}]`／`skus[{skuId,specValues,priceCents,stock}]`
- 服務：`serviceId`／`priceCents`／`durationMinutes`／`skillTags[]`
- 訂單：`orderId`／`orderNo`／`status`／`amounts[{serviceFeeCents,materialFeeCents,totalCents}]`／`items[]`
- 師傅：`technicianId`／`status`／`skillTags[]`／`earningsCents`

## 限制（第一階段）

- Mock 資料存在記憶體，重啟 server 會重置。
- 尚未接 P2 CloudDB／P5 Use Cases；正式版由 P8 的 `admin-api` 取代 Mock Server。
- 圖片上傳目前回傳 data URL／佔位圖；正式圖片上傳走雲存儲（P8 後續）。
- 尚未實作退款審批、分帳、分類管理、權限組管理（下一階段）。
