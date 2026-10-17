# SESSION HANDOFF — 維修服務平台改造

> **用途**：換 session 時，把本文件整份貼給新的 Claude 即可無縫接手。
> **維護規則**：每完成一個大階段更新一次。
> 最後更新：2026-10-17（**主包瘦身＋分包、優惠券、聊天、師傅端骨架、預約表單完成**）
>
> ⚠️ 本文件只描述**當前狀態**；歷史階段的細節以 `docs/P*-計畫.md` 與 git log 為準。

---

## 1. 專案一句話說明

把微信開發者工具的 **TDesign 零售電商模版**，改造成**維修服務平台**
（客戶／客服／師傅／管理員四角色，含未來微信支付服務商分帳、退款、分帳回退），
後端採**六角形架構（Ports and Adapters）**，未來跑在微信雲開發雲函數上。
**目前仍是無雲環境模式**：`config.apiMode = 'fake'`，資料來自 `services/api/_fake` 與本機 Storage。

---

## 2. 當前進度總表

| 階段 | 狀態 | 說明 |
|---|---|---|
| P0 前置驗證 | ✅ | 本地 20/20；雲端驗證仍待使用者執行 |
| P1 基礎骨架 | ✅ | 23 項驗收 |
| P2 資料庫與 Repository | ✅ 無雲模式 | 22 集合 manifest、20 個 Port、InMemory＋CloudDB、契約測試；CloudDB 尚未實跑 |
| P3 身分與權限 | ✅ 無雲模式 | `AuthenticateUseCase`、`authorize`、角色化查詢、脫敏、MerchantConstraint |
| P4a/b/c 值物件／訂單／策略 | ✅ | 狀態機、定價、退款、分帳、審計、ABAC |
| P5 Use Cases | ✅ Mock 金流 | 訂單生命週期、退款、分帳、稽核、工單 |
| P6 真實支付／分帳 | ⛔ 外部阻斷 | 等商戶號與分帳權限；P5 已用 Mock 完成 |
| P7a-1 前端基礎 | ✅ | tabBar、路由、角色分發、規範守衛 |
| P7a-2a 購物車＋商品＋結算 | ✅ | T1–T7（含 T3.5／T3.6／T6a／T6b） |
| P7a-2b | 🟡 大部分完成 | 首頁、聊天、優惠券、預約表單已做；剩餘見 `docs/07` |
| P7b 前端接真 API | ⏸ | `services/api/real/**` 仍是 `notImplemented()` |
| P8 Web 後台 | ✅ Mock | `admin-web` 兩階段；尚未接真 `admin-api` |
| P9 整合測試 | ⏸ | |
| P10 上線 | ⏸ | |

**最新測試數：1502 tests（1496 pass／6 skipped／0 fail）**

`npm run verify` = `check:layering`＋`check:frontend`＋`sync:check`＋全部測試。

---

## 3. 本輪新增（2026-10-17）

### 3.1 主包瘦身與分包 ✅

- **主包只留 5 個 tabBar 頁**：首頁／分類／購物車／訂單／我的。
- 分包：
  - `pages/goods`：`list/index`、`details/index`
  - `pages/order`：`order-confirm/index`、`order-detail/index`
  - `pages/user`：`person-info`、`address/list`、`address/edit`、`name-edit`、`favorites`、`inquiries`、`settings`
  - `pages/chat`：`index`
  - `pages/admin`：`overview/index`
  - `pages/technician`：`home`、`tasks`、`earnings`、`apply`
- 舊電商頁面**不打包**（售後、搜尋、結果、評論、優惠券、促銷、`pages/services` 空殼）；
  檔案仍在 repo，靠 `project.config.json` 的 `packOptions.ignore` 排除。
- `config/areaData.js`（455 KB）與 `utils/addressParse.js` 已移到 `pages/user/common/`。
- TDesign 只保留實際使用的元件的依賴閉包（約 30 個＋`common`／`mixins`），其餘全部 ignore。
- `packOptions.ignore` 也排除 `admin-web`、`node_modules`、舊 model／service／component、`*.md`、`*.log`、`.DS_Store`、`.d.ts`。
- **靜態估算主包約 750–770 KB**；DevTools 的實際體積仍待使用者重新編譯確認。
- 新增 `tests/unit/frontend/packaging.test.js` 護欄：
  - 主包只能是 tabBar 5 頁
  - active 頁面檔案齊全
  - app.json 不得引用舊頁面
  - TDesign 使用閉包不能被 ignore；未使用元件必須 ignore
  - `areaData`／`addressParse` 不得回流主包
  - active 頁面不得導向舊路由
  - DevTools 自訂條件不得指向舊頁面

### 3.2 首頁／訂單／我的

- 首頁：Banner、金剛區、Tabs（常用零件／熱門服務）、**P8 `catalog-card` 自畫卡片**、load-more。
- 我的：`user-center-card`＋`order-group`＋原版 cell 選單；接 `fetchUserProfile`／`fetchOrders`。
- 訂單：
  - 去支付 → `payOrder` 模擬 API，成功刷新並轉「待派單」
  - 取消 → 確認彈窗＋`cancelOrder`
  - 退款 → 底部彈窗＋`requestRefund`
  - 詳情 → `pages/order/order-detail`（新 API）
- 訂單詳情已重寫，不再使用舊 `services/order/orderDetail`。

### 3.3 優惠券 ✅

- Domain：`Coupon`、`UserCoupon`（unused／used／expired）。
- Ports＋InMemory：`CouponRepository`、`UserCouponRepository`。
- 後台：`admin-web` 新增「優惠券管理」（列表、新增、發放給指定客戶／全員）。
- Mock Server：`GET/POST /api/coupons`、`GET /api/coupons/recipients`、`POST /api/coupons/:id/issue`。
- 結算頁：讀 `fetchMyCoupons`、彈窗選券、抵扣、同步 `expectedTotalCents` 並寫回 `repair.checkout.v1`。
- `utils/couponView.js` 純函式＋測試。

### 3.4 客服聊天 ✅（Storage 模擬）

- 路由：`/pages/chat/index?targetId=cs-1&productId=...`（服務用 `serviceId`）。
- 詳情頁「客服」→ 聊天頁；對話為空時自動送商品／服務卡片。
- 訊息：文字、語音、圖片、商品卡片；長按引用；Emoji／+ 面板；語音按住錄音遮罩。
- Storage：`utils/chat.js`，key `repair.chats.v1`；schema 已預留 P5 WebSocket。
- 「我的詢問」→ 會帶 `inquiryId` 進入同一條對話，對話為空時補上原詢問與客服回覆。
- 語音播放：全域單例 `wx.createInnerAudioContext()`；處理 ended／error／stop；無 `audioPath` 時用 3 秒動畫模擬。
- **尚未接真實音訊錄製**；語音暫存路徑欄位為 `audioPath`。
- 圖片選擇使用 `sizeType: ['compressed']`，只存本機暫存路徑，不存 base64。

### 3.5 多租戶與師傅端骨架 ✅

- `Order`／`Product`／`Service`／`Technician`／`User` 預留 `merchantId`（預設 `'platform'`）。
- actor 帶 `merchantId`；新增 `MerchantConstraint`：
  - 師傅只能看同 `merchantId` 的訂單
  - 缺少 order → fail-closed
  - 已掛到 `orders.read／accept／reject／arrive／complete／update_status`
- `OrderQueryAdapter`（InMemory／CloudDB）同步做商戶過濾。
- 師傅端分包 `pages/technician`：接單大廳／我的任務／收益／入駐申請＋自製底部導航。
- `roleRouter` 的 technician 首頁改為 `/pages/technician/home/index`。
- 骨架不顯示任何客戶姓名／手機／地址。
- 計畫文件：`docs/08-多租戶與師傅端-計畫.md`。

### 3.6 服務預約表單與結算 ✅

- Domain：`AppointmentInfo` 值物件（`appointmentAt`／`address`／`contactName`／`contactPhone`／`description`／`mediaUrls`）。
  - 手機 853／86 校驗（`PhoneNumber`）
  - 描述最多 500 字；附件最多 9 個
  - `Order` 的 persistence／snapshot／rehydrate／DTO 都支援
- 結算頁：
  - 預約日期＋時間（原生 `picker`，預設明天 10:00）
  - 聯絡人姓名／手機（地址自動預填；支援 +853／+86）
  - 問題描述（500 字）
  - 照片上傳（compressed）＋模擬錄音，最多 9 個
  - 提交時寫入 `repair.checkout.v1` 的 `appointmentInfo`／`appointmentAt`
- 訂單詳情：顯示聯絡人、手機、問題描述、附件縮圖／語音附件。
- Fake 訂單 `R20261016000001` 有示範預約資訊可直接看。

### 3.7 明確**不做**：小程序管理端

使用者已決定**完全不做小程序管理端**：

- 沒有 `docs/01 §4.10`
- 沒有 `admin.mobile` 權限組
- 沒有擴充 `pages/admin/overview` 的管理 UI
- Web 後台是唯一管理端；手機需求建議 responsive Web／H5 或企業微信
- 還原點：`tag pre-admin-mobile` → `b70d2d0`

---

## 4. Git 狀態

| 項目 | 值 |
|---|---|
| 分支 | `refactor/hexagonal` |
| 最後程式 commit | **`e51877b`**（feat: 服務預約表單與結算流程） |
| 本交接文件 | 緊接在 `e51877b` 之後的 docs commit（以 `git log -1` 為準） |
| 遠端 | `git@github.com:nctgitedIvan/repair_svc_app_wb.git` |
| 基線 | `main` = `a747010`（TDesign 原始狀態） |
| 還原 tag | `pre-admin-mobile` → `b70d2d0`；另有 `p0-done`、`p1-done`、`pre-p7a2a-*` |
| 備份分支 | `backup-origin-main`、`backup-origin-refactor` |

> 交接完成後應已 `git push origin refactor/hexagonal`。
> 若 `git status` 不乾淨，先問使用者，不要自行丟棄改動。

---

## 5. 紅線與禁令

1. **不改真實雲環境**：`config.apiMode` 保持 `'fake'`；不部署、不切 CloudDB、不動 P6 金流。
2. **不改 `services/api/real/**` 的 stub 為真實呼叫**（P7b 才做）。
3. **遵守六角形架構**：
   - `domain` 不得碰 `wx.*`、`cloud.*`、`Date.now()`、`Math.random()`、`console`
   - `ports` 只有契約，不得有實作
   - 只有 `bootstrap.js` 可以 `new *Adapter(`
   - 頁面只能透過 `services/api/index.js` 取資料
4. **不在前端判斷權限**；權限一律在 Use Case／AccessPolicy。
5. **師傅端不得取得客戶完整手機／完整門牌**；只能走 AXB 或客服三方通話。
6. **不新增小程序管理端**（使用者已決定不做）。
7. **不把密鑰、商戶號、API v3 key 寫進前端或 repo**。
8. **每個 commit 必須 `npm run verify` 全綠**；不要用 `--no-verify`。
9. **不准用 shell 做含反引號或 `${}` 的文字取代**；一律用 Edit/Write。
10. **不刪除現有集合或功能**（除非明確同意）；舊頁面目前是「不打包」而非刪除。

---

## 6. 已知限制與下一步

### 6.1 待使用者驗證

| # | 項目 |
|---|---|
| 1 | DevTools 重新編譯，確認主包 < 2 MB |
| 2 | 逐頁路由：首頁／分類／購物車／訂單／我的／商品列表／詳情／結算／訂單詳情 |
| 3 | 我的 → 詢問 → 進入聊天，確認歷史 |
| 4 | 聊天語音氣泡播放／停止／失敗 Toast |
| 5 | 結算頁預約表單＋照片／模擬錄音；訂單詳情看 `R20261016000001` |
| 6 | 師傅端：暫時把 `services/api/_fake/index.js` 的 `currentRole` 改成 `technician`，確認導向 `/pages/technician/home/index` |

### 6.2 下一階段建議

1. **P7b**：實作 `services/api/real/**`，讓頁面可切 `apiMode='cloud'`。
2. **P9**：整合測試與人工驗收（含主包體積、路由、離線／錯誤態）。
3. **P6**：等商戶號後接真實支付／分帳／退款。
4. **媒體壓縮（可延後）**：
   - 目前圖片用 `sizeType: ['compressed']`，只存本機暫存路徑
   - 尚未做上傳前壓縮／縮圖／轉檔
   - 未來建議新增 `utils/media.js`，上傳前壓縮，雲端只存 fileID，並清理本機暫存
5. **師傅端 Phase 3**：接任務 API、接單／到場／完工、收益、入駐審核（見 `docs/08` §4）。

---

## 7. 關鍵文件索引

| 文件 | 內容 |
|---|---|
| `docs/01-目標架構.md` | 主架構：分層、狀態機、DTO、權限矩陣、支付與多租戶 |
| `docs/02-實施計畫.md` | P0–P10 |
| `docs/03-開發規範.md` | 後端規範 |
| `docs/04-前端規範.md` | 前端五條紅線、角色顯示 vs 權限、平台限制 |
| `docs/05-上雲部署手冊.md` | 上雲 SOP（CloudDB、setup-db、probe-tx、四支 API） |
| `docs/06-P6-微信支付預案.md` | P6 支付／分帳預案 |
| `docs/07-上雲後待辦清單.md` | TODO 盤點（含 P5 路由、Toast 佔位、舊電商殘留） |
| `docs/08-多租戶與師傅端-計畫.md` | merchantId、MerchantConstraint、師傅端骨架與 Phase 3 |
| `docs/SESSION-HANDOFF.md` | 本文件 |

### 近期 commit

```
e51877b feat: 服務預約表單與結算流程
cb55068 feat: 多租戶預留與師傅端骨架
229c9ea fix: 修復聊天歷史與語音播放
b277ab8 refactor: 分包改造與主包瘦身
b70d2d0 feat: 淘寶式客服聊天（Storage 模擬）
641c1a2 feat: 優惠券系統（Domain、後台與結算頁抵扣）
b2cc8c3 feat: 首頁微調與訂單狀態聯動
b43ddba feat: 還原首頁／我的 UI 並接上雲函數 event.action 路由
```

---

## 8. 新 Session 的標準開場白

```
你現在是我的資深微信小程序雲開發架構師、六角形架構專家、
微信支付服務商分帳與退款專家。請用繁體中文回覆。

請先閱讀 docs/SESSION-HANDOFF.md（我貼在下面），那是完整的進度交接。
再依它的指示讀取相關文件。

專案簡介：
把 TDesign 零售電商模版改造成維修服務平台，四角色（客戶／客服／師傅／管理員），
後端採六角形架構，未來跑在微信雲開發。目前仍是 fake／Storage 模式。

目前進度：
- P2／P3／P5／P8 Mock 完成
- P7a-2a 完成；P7a-2b 大部分完成
- 主包瘦身與分包完成（主包只留 5 個 tabBar 頁）
- 優惠券、聊天、多租戶 merchantId、師傅端骨架、預約表單完成
- 小程序管理端已決定不做；Web 後台是唯一管理端
- 最新測試：1502 tests（1496 pass／6 skipped／0 fail）

下一個目標：
1. 先確認 `git log -1`、`git status`、`npm run verify`（必須全綠）
2. 依 docs/07 與 docs/08 的待辦，優先處理 P7b／P9
3. 媒體壓縮／上傳可延後，但不要存 base64

工作方式：
1. 動手前先出逐檔計畫（改哪些檔、新增哪些檔、驗收標準、影響範圍、回滾方式），
   我確認後才動代碼
2. 每個 commit 完成後回報：改了什麼、跑了什麼驗證、結果
3. 每個階段結束做逐 commit 稽核（逐一 checkout + npm run sync + npm run verify）
4. 遇到計畫外狀況停下來問我，不要自行決定
5. 全程用 Edit/Write；不要用 shell 做含反引號或 ${} 的文字取代

紅線：
- 不改真實雲環境、不切 apiMode='cloud'、不動 P6 金流
- 遵守六角形架構；Domain 不碰 wx API
- 頁面只能透過 services/api/index.js 取資料
- 師傅端不得取得客戶完整手機／門牌
- 不新增小程序管理端
- 每個 commit 必須 npm run verify 全綠

---以下為 SESSION-HANDOFF.md 全文---
（貼上完整內容）
```

---

## 9. 給接手者的四個提醒

1. **Git 狀態以指令為準**：先跑 `git log -1`、`git status`、`git branch --show-current`。
2. **`npm run verify` 必須全綠**（1502 tests）。紅了先修，不要繼續往下做。
3. **兩個守衛會擋你，那是設計不是 bug**：
   - 改 `packages/` 後忘記 `npm run sync` → 雲函數拒絕啟動
   - `pages/` 出現權限判斷或未登記的撥號 → `check:frontend` 擋下
   - 使用未保留的 TDesign 元件或把非 tabBar 頁面放回主包 → `packaging.test.js` 擋下
4. **WXML 沒有編譯期檢查**。改完 WXML 後要人工核對：
   - 事件處理函式存在
   - 自訂元件已在 `usingComponents` 註冊
   - `triggerEvent` 名稱與 `bind:` 名稱一致
   - 沒有橫向溢出；輸入框使用 `adjust-position`
