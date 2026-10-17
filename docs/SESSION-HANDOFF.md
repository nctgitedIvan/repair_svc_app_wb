# SESSION HANDOFF — 維修服務平台改造

> **用途**：換 session 時，把本文件整份貼給新的 Claude 即可無縫接手。
> **維護規則**：每完成一個大階段更新一次。
> 最後更新：2026-10-17（**P7a-2a 全部完成：T1–T7**，含 T3.5／T3.6／T3.6.1／T6a 系列／T6b；
> **下一步：P9 整合測試；P6 真實支付等商戶號**）

---

## 1. 專案一句話說明

把微信開發者工具的 **TDesign 零售電商模版**，改造成**維修服務平台**
（客戶／客服／師傅／管理員四角色，含微信支付服務商分帳、退款、分帳回退），
後端採**六角形架構（Ports and Adapters）**跑在微信雲開發雲函數上。

---

## 2. 當前階段與進度

| 執行序 | 階段 | 狀態 |
|:---:|---|---|
| 1 | **P0** 前置驗證 | ✅ 完成（本地 20/20） |
| 2 | **P1** 基礎骨架與共享代碼 | ✅ 完成（23 項驗收） |
| 3 | **P4a** 值物件與錯誤型別 | ✅ 完成 |
| 3 | **P4b** Order 聚合、狀態機、定價 | ✅ 完成 |
| 3 | **P4c** 策略與存取控制 | ✅ 完成（兩次交付 + crypto 白名單補強） |
| — | **P7a-1** 前端基礎設施＋tabBar／路由 | ✅ 完成（T1–T9） |
| — | **P7a-2a** 購物車＋商品＋結算 | ✅ **7/7 完成**（T1–T7；含計畫外 T3.5／T3.6／T3.6.1 與 T6a 系列／T6b） |
| — | **P7a-2b** 服務詳情＋分類頁＋首頁調整 | ⬜ 未開始 |
| 4 | **P2** 資料庫與 Repository | ✅ **完成（無雲環境模式）**：22 集合 manifest／20 個 Port／InMemory＋CloudDB／契約測試；CloudDB 尚未實跑 |
| 5 | **P3** 身分與權限 | ✅ **完成（無雲模式）**：Authentication／authorize／角色化查詢／脫敏 |
| 6 | **P5** application Use Cases | ✅ **完成（Mock 金流）**：訂單生命週期／退款／分帳／稽核／工單 |
| 7 | **P6** 支付、分帳、退款 | ⛔ 外部阻斷（等商戶號與分帳權限；P5 已用 Mock 完成邏輯） |
| 8 | **P7b** 前端接線 | ⏸ 依賴 P5 |
| 9 | **P8** 後台 Web API | ✅ **Mock 後台完成（無雲模式）**：`admin-web` 第一／第二階段；尚未接真 `admin-api` |
| 10 | **P9** 整合測試 | ⏸ |
| 11 | **P10** 上線 | ⏸ |

**執行順序**：`P0 → P1 → P4 → P2 → P3 → P5 → P6 → P7 → P8 → P9 → P10`
**可並行**：P7a（前端，不依賴後端）、P8（P5 後）

**測試數：1369 全過（6 skipped：CloudDB 契約）**（… → P3+P5 1356 → **電話／三頁對接 1369**）

---

## 3. 已確認決策清單

### 3.1 路線決策（最新）

| 代號 | 決策 |
|---|---|
| **路線 C（探針）** | ✅ **先查官方文檔，明確就跳過探針**。結果：**文檔明確支援事務與 `inc`** → **跳過探針**，P2 按「支援」設計，在 P2 契約測試中實測驗證。詳見 `docs/P2-0-文檔核實報告.md` |

### 3.2 業務決策

| 代號 | 決策 |
|---|---|
| Q-A | P4a+P4b 照計畫執行 |
| Q-B | 狀態機允許所有非終態 → VOIDED |
| Q1 | `admin-api` 認證 = **帳密 + JWT** |
| Q2 | 遠端分歧 → force-push（已執行，備份分支存在） |
| Q3 | 前端 Feature Flag **採用，限頁面層級** |
| A5 | 師傅＝申請審核制；客服／管理員＝管理員指派 |
| A6 | 部分退款**按明細項勾選** |
| A7 | 電商功能**入口下線、代碼保留**（⚠️ 購物車已被 §3.7 撤銷下線） |
| A8 | 雲函數維持 6 個，第一期先建 4 個 |
| A9 | 逾時分「告警」與「自動處置」兩段 |
| A11 | 地址降級 7 天 |
| A12 | 材料費＝平台統一定價隨單收 |
| A13 | **職責分離**：客服派單／溝通／查詢／申請退款；管理員改價／改分潤／審批退款／改師傅權限 |
| Q1(P4) | 新增 `VOIDED`（92），作廢＝軟刪除 |
| Q2(P4) | SoD **只登記在 `refunds.approve_large`** |
| Q7 | 「刪訂單」→「**作廢訂單**」 |
| Q8 | 雙人覆核單人例外：單人 + 留痕 + 24h 冷卻期 |
| Q9 | 哈希鏈**分段**（每訂單一條 + 每日全域一條） |
| Q10 | 對帳三層：1 元 / 100 元 / 1000 元（後者凍結結算） |
| Q11 | 改價 20% 基準 = 該商品上一次定價 |
| Q12 | 已付款作廢須同時退款；**已完成不能作廢** |
| Q13 | 24h 冷卻期＝**立即生效 + 可推翻** |
| Q14 | 凍結結算＝**真的拒絕 `ExecuteProfitSharing`** |
| Q-C(§4.8) | bcrypt 還是 scrypt → **`crypto.scrypt`**（N=16384, r=8, p=1） |
| Q-D(§4.8) | 超級管理員**至少 2 位**，敏感操作需另一位確認 |
| Q-E(§4.8) | JWT：2h access + 黑名單；refresh 存 httpOnly cookie |

### 3.3 §3.7 服務與商品（最新，含撤銷 A7 購物車下線）

| 項目 | 決策 |
|---|---|
| 領域分離 | ✅ `Service` / `Product` 分離，共同介面 `CatalogItem` |
| **集合結構** | ✅ **維持 `services` 與 `products` 分開**（不合併為 `catalog_items`） |
| 三個下單入口 | 服務詳情（**立即下單**）／商品詳情（加入購物車）／購物車（純商品結算） |
| **核心規則** | **服務永遠不進購物車** |
| 訂單結構 | 不變（`item_type` + `fee_type`），退款邏輯不受影響 |
| **庫存扣減時機** | **支付時扣**（初期簡化；日後可升級為預佔→確認→釋放） |
| 純服務訂單 | **必須走 `order_items`**（否則退款邏輯要寫兩套） |
| 購物車儲存 | P7a-2a 用本機 Storage，**schema 對齊後端**，P7b 改後端 |
| 購物車上限 | 50 項 |
| tabBar（5 項） | 首頁 \| **分類** \| 購物車 \| 訂單 \| 我的 —— T3.5 改名（標題＋圖示）、**T3.6 改指向 `pages/category/index`**（TDesign 原始分類頁，接上新 API） |
| 分類頁佈局 | 左側一級分類／右側**二級 tabs**／下方兩列網格（✅ **已定案**：T3.6 改為二級分類，`docs/01` §3.7.9 有修正註記） |
| 首頁順序 | **常用零件在上、熱門服務在下** |

### 3.4 架構關鍵決策

| 主題 | 決策 |
|---|---|
| 語言 | `.js` + JSDoc，不引入 TypeScript |
| 共享代碼 | `packages/` 唯一真實來源 + 實體複製 + **雜湊雙寫守衛** |
| 部署 | **必須選「上傳所有檔案」** |
| 測試 | Node 內建 `node:test`（零依賴） |
| ESLint | **不建**；架構規則由 `check-layering.js` 保證 |
| 脫敏 | **Port 層角色化查詢**；adapter 可呼叫 domain 策略，不得自寫角色判斷 |
| 權限宣告 | **每個權限必須宣告 `constraints`**；缺欄位拋 `MisconfiguredPermissionError` |
| crypto | **白名單制**（只有 `createHash`）+ **只允許 `AuditChain.js` 使用** |
| 撥號 | **白名單制**，師傅端一律禁止 |

---

## 4. 當前 Git 狀態

| 項目 | 值 |
|---|---|
| 分支 | `refactor/hexagonal` |
| 最後程式 commit | **電話／三頁對接（`9287335`）**；本次為上雲文件 commit |
| 基線 | `main` = `a747010`（TDesign 模版原始狀態） |
| Tag | `p0-done`、`p1-done`、`pre-p7a2a-tabbar`、`pre-p7a2a-t35`、`pre-p7a2a-t4`、`pre-p7a2a-t36`、`pre-p7a2a-t361`、`pre-p7a2a-t6a`（**P2／P3／P5／P8 未另打 tag**） |
| 備份分支 | `backup-origin-main`、`backup-origin-refactor` |
| 遠端 | `git@github.com:nctgitedIvan/repair_svc_app_wb.git`（**已 push 到 `origin/refactor/hexagonal`**） |
| 領先／落後 | 以 `git rev-list --count main..HEAD` 為準（本版為 **132**，含本次文件 commit） |

> ⚠️ 這一格**每次更新都容易過時**（前兩版都寫錯：23→63→實際 90）。
> **請一律以指令輸出為準** —— 見 §10 第 1 點。

**回滾**（由近到遠）：
- `git reset --hard pre-p7a2a-t6a` —— 放棄 T6a（詳情頁接新 API + 加購 + 收藏）
- `git reset --hard pre-p7a2a-t361` —— 再放棄 T3.6.1（4 個 bug 的修正）
- `git reset --hard pre-p7a2a-t36` —— 再放棄 T3.6（分類頁還原）
- `git reset --hard pre-p7a2a-t35` —— 再放棄 tabBar 改名
- `git reset --hard pre-p7a2a-t4` —— 再放棄整個 T4（購物車改造）
- `git reset --hard p1-done` —— 回到 P1 完成點
- `git checkout main` —— 全部放棄

---

## 5. 未完成的驗證清單

| # | 項目 | 狀態 |
|---|---|---|
| 1 | **P2-0 探針** | ✅ **已由路線 C 取代**（文檔明確，跳過探針） |
| 2 | **P0 雲端驗證** | ⏸ **待使用者執行**（`docs/P0-驗證報告.md` §8 部署 `spike-hello`） |
| 3 | **P1 的 C1／C2／C3** | ⏸ **待使用者執行**（部署 4 支雲函數、健康檢查、地址編輯頁） |
| 4 | **P7a-2a 的人工驗收 C1–C13** | ⏸ **待使用者執行**（T4 的購物車；步驟見 `docs/P7a-2a-T4-計畫.md` §11.3，內含可貼的 Storage 種子資料；**T6a.3 已升為 `repair.cart.v2`／`prd-1:sku-std`**） |
| 5 | P7a-2a 的 C1–C6（原清單） | ⏸ 待 T7 完成後一併執行 |
| 6 | **T5 商品列表的人工驗收 C1–C12** | ⏸ **待使用者執行**（步驟見 `docs/P7a-2a-T5-計畫.md` §6.2） |
| 7 | **T6b 詢問流程的人工驗收 C1–C9** | ⏸ **待使用者執行**（步驟見 `docs/P7a-2a-T6b-計畫.md` §8.2） |
| 8 | **T7 結算流程的人工驗收 C0–C10** | ⏸ **待使用者執行**（步驟見 `docs/P7a-2a-T7-計畫.md` §10.2） |

**這八項都不阻塞 P2 開工。**

> **T4 的人工驗收為何需要種子資料**：購物車的**唯一**生產者原本只有商品詳情頁
> （**T6a** 的工作）。T3.6.1 已在**分類頁**補上加購（無規格零件可直接加入），
> 所以現在也可以從分類頁加購；但仍建議照 §11.3 的種子資料走，最省事。

---

## 6. 下一步要做什麼

### 6.0 ✅ **T6a.3 已完成（2026-10-17）**

| 階段 | commit | 內容 |
|---|---|---|
| **A1** | `ac62314` | fake 新形狀（`specs` 維度／`skus`／`images`／`nameEn`／`detailHtml`）＋ `detailView` 直接映射 |
| **A2** | `3097b00` | 移除資料中的舊 `thumb`，讀取點改 `images[0]` |
| **B** | `0c5a087` | 選中 SKU 收斂 `maxBuyQuantity`；加購存 `skuId`；購物車 `repair.cart.v2`；rich-text；移除 `selectedSpecIdOf` |
| **C** | `e689a9e` | buy-bar 兩顆按鈕全圓角＋12rpx 間距；rich-text 容器與間距 |
| **D** | 本次收尾 | 文件（本檔、`docs/01` §3.8／§7.4.7、T4 種子）；服務底部「客服＋立即預約」；修正 `favorite.toSnapshot` 的 `thumb` 遺漏 |

**驗證**：`npm run verify` 全綠（1084）；人工驗收 C1–C7 待使用者執行。
**資料模型**：`docs/01` §7.4.7 已標記三處差異全部收斂。

### 6.0.1 ✅ **T5 已完成（2026-10-17）**

| 階段 | commit | 內容 |
|---|---|---|
| 計畫 | `7a9dd36` | `docs/P7a-2a-T5-計畫.md` 批准存檔 |
| **T5-1** | `ce56966` | `catalogView` 新增 `mergeCatalog`／`filterCatalogItems`／`sortCatalogItems`／`paginateItems`；列表頁改接三個新 API |
| **T5-2** | `2d6f574` | 搜尋、一級分類 chips、排序、價格區間、載入更多、空態／重試外框 |
| **T5-3** | `efc742b` | 售完守門（`SOLD_OUT`）、失敗文案統一、分類頁 M8（有規格導向詳情） |
| **T5-4** | 本次收尾 | 文件更新 |

**驗證**：`npm run verify` 全綠（**1118**）；人工驗收 C1–C12 待使用者執行。
**詳細計畫與診斷**：`docs/P7a-2a-T5-計畫.md`。

**T5 之後「舊 id 入口」的狀態**：`pages/goods/list` 已修正（帶 `productId`／`serviceId`）；
`pages/home/home`（→ P7a-2b）、`pages/goods/result`（未排程）、
`pages/order/order-detail` 與 `after-service-detail`（→ P2 之後接新訂單）仍為舊 id。

### 6.0.2 ✅ **T6b 已完成（2026-10-17）**

| 階段 | commit | 內容 |
|---|---|---|
| 計畫 | `f66aba9` | `docs/P7a-2a-T6b-計畫.md` 批准存檔 |
| **T6b-1** | `70a8c7b` | `utils/inquiry.js`＋35 項測試（快照、預設訊息、200 字、上限、正規化、排序） |
| **T6b-2** | `8f72d5a` | `inquiry-popup` 元件；詳情頁「客服」接線（商品詢問；服務 Toast） |
| **T6b-3** | `1a12b76` | 「我的詢問」入口＋`pages/user/inquiries` |
| **T6b-4** | 本次收尾 | 文件更新 |

**驗證**：`npm run verify` 全綠（**1153**）；人工驗收 C1–C9 待使用者執行。
**限制**：P7a 只做客戶端 UI＋本機 Storage（`repair.inquiries.v1`）；
客服端收到／回覆需 **P5**，**本階段沒有客服端頁面**。服務詢問未支援（schema 是 `product_id`）。

### 6.0.3 ✅ **T7 已完成（2026-10-17）**

| 階段 | commit | 內容 |
|---|---|---|
| 計畫 | `907c776` | `docs/P7a-2a-T7-計畫.md` 批准存檔 |
| **T7-1** | `dfdb37a` | 移除 T4 相容橋接（`LEGACY_CHECKOUT_KEY`／`toLegacyGoodsRequest`）；`toCheckoutPayload` 改 §3.8 契約 |
| **T7-2** | `7791bd3` | `utils/checkoutView.js`＋29 項測試（明細、材料費／服務費、失效列、價格變動） |
| **T7-3** | `524513a` | 重寫結算頁（地址預設／明細／金額／模擬提交） |
| **T7-4** | `c5a62f5` | 詳情頁立即購買／立即預約接結算；規格彈窗 `confirmText` |
| **T7-5** | 本次收尾 | 文件更新 |

**驗證**：`npm run verify` 全綠（**1178**）；人工驗收 C0–C10 待使用者執行。
**限制**：P7a 沒有支付與訂單後端，提交只做模擬成功；成功後導向訂單 tab
（`pages/orders/index` 目前是 P7a-1 骨架，內容屬 P7a-2）。
地址沿用既有 mock 地址列表的**預設地址**（`isDefault`），沒有則請使用者選擇。

### ✅ P7a-2a 完成

| # | 任務 | 狀態 |
|---|---|---|
| T1–T4 | 購物車基礎與頁面 | ✅ |
| T5 | 商品列表 | ✅（見 §6.0.1） |
| T6a／T6b | 詳情頁／客服詢問 | ✅（見 §6.0／§6.0.2） |
| T7 | 結算頁與下單流程 | ✅（見 §6.0.3） |

> **T6 已於 2026-10-16 拆分為 T6a／T6b**（使用者要求）——
> 新需求（收藏、客服詢問）、`inquiries`／`favorites` 資料模型與三條限制，
> 見 **`docs/P7a-2a-計畫.md` §13**。

> ✅ **T6a 已修好那個 bug**：詳情頁原本對 `prd-*` 查不到資料
> （`model/good.js` 的 `allGoods[id % allGoods.length]` → `NaN`）而顯示
> ¥0.00、無圖、無規格。現在資料來自新 API，並新增「服務與商品共用同一頁」。

> **參數契約（T6a 已定案）**：`productId` 為正式、`serviceId` 為服務、
> `spuId` 留作過渡相容（T4／T3.6 目前同時帶它，值相同 —— 可留待那兩處清理時移除）。

> ⚠️ **T6a 之後「舊 id 入口」會顯示「找不到這件商品」**（比原本的 ¥0.00 好）：
> `pages/home/home`（→ P7a-2b）、`pages/goods/list`（✅ **T5 已修正**）、
> `pages/goods/result`（未排程）、`pages/order/order-detail` 與 `after-service-detail`
> （→ P2 之後接新訂單）。完整對照表見 `docs/P7a-2a-T6a-計畫.md` §11.1。

> ⚠️ **T6b 的限制（已完成，但仍然是 P7a 的臨時方案）**：P7a 階段沒有資料庫與雲函數，
> T6b 只做了「客戶端 UI ＋ 本機 Storage 寫入」；
> **客服端真的收到／查看／回覆需要 P5**（本階段沒有客服端頁面）。
> 且 `customer_id` 一律由後端以 OPENID 決定（P7a 用佔位符，**P5 必須改**）。
> 服務詢問未支援（`inquiries` 的鍵是 `product_id`）。

### 6.2 ✅ T7 已清掉 T4 的相容橋接（2026-10-17）

| # | 項目 | 狀態 |
|---|---|---|
| 1 | `pages/cart/index.js` 的 `LEGACY_CHECKOUT_KEY` 與舊格式寫入 | ✅ 已移除 |
| 2 | `utils/cartView.js` 的 `toLegacyGoodsRequest()`／`LEGACY_STORE_ID`／`LEGACY_STORE_NAME` | ✅ 已移除 |
| 3 | `tests/unit/frontend/cartView.test.js` 的「toLegacyGoodsRequest」測試組 | ✅ 已刪除 |
| 4 | 結算頁改讀 `repair.checkout.v1` | ✅ 已完成（T7-3） |

> 現在購物車、商品立即購買、服務立即預約**只寫一份** `repair.checkout.v1`；
> 舊 key `order.goodsRequestList` 在程式中為 0 筆。

### 6.0.4 🕒 P7a-2b 延後（移交 P7a-2b／P7b）

**決策（2026-10-17）**：先做 **P2（真實資料庫）**，P7a-2b 延後。
理由：前端已用 fake 資料把邏輯跑通；繼續做 P7a-2b 只會增加模擬代碼。

移交項目：

| # | 項目 | 接手階段 |
|---|---|---|
| 1 | 服務預約時段選擇 | P7a-2b |
| 2 | 首頁內容（熱門服務／常用零件） | P7a-2b |
| 3 | 混合單加購入口 | P7a-2b |

### 6.1 下一步：P2

計畫：**`docs/P2-逐檔計畫.md`**（已批准；`414f0f9`）。
重點：P2-0 事務探針 → 22 集合／索引／權限 → **20 個 Repository Port**（含 InMemory／CloudDB）→ 契約測試。

**完成進度（2026-10-17，無雲環境模式）**：

| 步驟 | commit | 狀態 |
|---|---|---|
| P2a-1：22 集合 manifest、`setup-db`、索引清單、操作指南 | `1240c1a` | ✅ |
| P2a-2：`CloudDBClient`／兩版 `UnitOfWork`／layering 規則 | `2633926` | ✅ |
| P2a-3：IdSequence／AuditLog／SystemConfig／Category | `b5e9b2c` | ✅ |
| P2-0：`probe-tx` 探針（只寫不跑） | `2e67e45` | ✅ |
| P2b-1：User／Customer／CsAgent／Technician | `e385ed8` | ✅ |
| P2b-2：Service／Product | `854bf1d` | ✅ |
| P2b-3：Cart／Favorite／Inquiry | `ba8d5c1` | ✅ |
| P2c-1：Order／OrderItem | `cd2bbfa` | ✅ |
| P2c-2：Payment／Refund／ProfitSharing／WorkOrder／WorkOrderMessage | `71aead0` | ✅ |

**驗證**：`npm run verify` 全綠；**1326 tests（6 skipped：CloudDB 契約）**。
**限制**：CloudDB adapter 已寫好但**未對真實雲端執行**；`setup-db`／`probe-tx` 尚未部署。
未來上雲時：跑 `setup-db` → `probe-tx` → `RUN_CLOUD_CONTRACT=1` 的契約測試。

### 6.1.1 ✅ P3 與 P5 完成（2026-10-17，無雲模式）

| 階段 | commit | 內容 |
|---|---|---|
| **P3** | `70f7d52` | `AuthenticateUseCase`、`authorize`、`OrderQueryPort`＋角色化查詢、電話／地址脫敏、權限與 ABAC 測試 |
| **P5** | `70f7d52` | `PaymentGateway`＋`MockPaymentGateway`、訂單生命週期 Use Cases、退款／分帳、AuditLog＋WorkOrderMessage、9 項整合測試 |

**驗證**：`npm run verify` 全綠；**1356 tests（6 skipped CloudDB）**。
**已知限制**：
- 所有金流都是 Mock；真實微信支付／分帳在 P6（需商戶號）。
- CloudDB 仍未實跑；切換點在 Composition Root。
- 完成訂單時若尚未回報到場，`CompleteOrder` 會自動先做 `reportArrival` 再完工（狀態機要求）。

### 6.1.2 ✅ P8 Mock 後台完成（2026-10-17，第一＋第二階段）

`admin-web/` 是**獨立專案**（不影響根目錄 `npm run verify`）：

| 項目 | 內容 |
|---|---|
| 前端 | React 18＋Vite＋Ant Design 5＋React Router＋axios |
| Mock Server | Node＋Express＋JWT（`admin-web/mock-server`，admin/admin） |
| 第一階段 | 登入、Dashboard、商品（含規格／SKU 編輯）、服務、訂單（詳情／指派）、師傅（審核／收益） |
| 第二階段 | 退款審批、分帳管理（80% 分潤）、分類管理（兩層 CRUD）、權限管理（RBAC 權限組） |
| 安全 | 5 次失敗鎖 30 分鐘、JWT permissions、寫入稽核（console＋`GET /api/audit-logs`） |
| 啟動 | `cd admin-web && npm install`；`npm run mock`＋`npm run dev` |
| 驗證 | `npm run build` 成功；Vite dev 200；登入鎖定與各 API 實測通過 |

**三端資料一致性（本批）**：
- 首頁／分類頁／商品列表頁皆使用 `fetchProducts`／`fetchServices`＋`catalogView.toCardModel`
- 三頁共用 `style/catalog-card.wxss` 的自畫卡片（圖片容器、兩行標題、標籤、價格左／購物車右）
- 導覽統一帶 `productId`／`serviceId`

**限制**：
- Mock 資料在記憶體，重啟重置；圖片上傳為 data URL／佔位圖。
- 尚未接真 `admin-api`／CloudDB；正式安全規範見 `docs/01` §4.9。

### 6.1.3 ✅ 全局電話與三頁資料對接（2026-10-17）

| 項目 | 內容 |
|---|---|
| 電話格式 | **853 + 8 位**／**86 + 11 位**／純 11 位；`PhoneNumber` 提供 `e164`／`formatted`／`masked` |
| 遮罩 | 澳門 `853 66** ****`；大陸 `138 **** 5678` |
| 前端 | `utils/phone.js`；地址編輯頁區號選擇器（預設 +853，可選 +86） |
| 後台 | `admin-web/src/utils/phone.js`；師傅電話格式化＋編輯（PATCH `/api/technicians/:id`） |
| 首頁 | `fetchHome`（Banner／公告／快捷入口）＋常用零件／熱門服務，全部走 `services/api` |
| 訂單頁 | 四 tabs（全部／待付款／進行中／已完成）、訂單卡片、支付／取消／退款／詳情（Toast） |
| 我的 | `fetchUserProfile`／`fetchOrders`；移除優惠券／積分；訂單宮格；收藏／詢問／地址／客服／設置 |
| API | 新增 `fetchHome`／`fetchOrders`／`fetchUserProfile`（fake＋real stub） |

**驗證**：`npm run verify` 全綠（**1369**）；`admin-web` build exit 0；Mock 電話 PATCH 與稽核實測通過。

### 6.1.4 ✅ 上雲準備文件（2026-10-17）

| 文件 | 內容 |
|---|---|
| **`docs/05-上雲部署手冊.md`** | repair-test 開通、`setup-db`（22 集合／索引／權限）、`probe-tx`、四支核心函數、CloudDB 契約測試、`apiMode` 切換、bootstrap CloudDB 注入模板 |
| **`docs/06-P6-微信支付預案.md`** | 服務商分帳模式、PaymentGateway／WeChatPay adapter 介面、回調驗簽／冪等／密鑰、支付／分帳／退款流程圖、測試與上線順序 |
| **`docs/07-上雲後待辦清單.md`** | P0／P6／P7b／P7a-2b／P8／P3-P5 路由／Toast 佔位／假資料／只寫未跑／舊電商殘留 |

> ⚠️ **重要現況**：`services/api/real/**` 仍是全部 `notImplemented()`；
> 四支核心雲函數仍是健康檢查骨架。**不要現在切 `apiMode='cloud'`**。

### 之後

`P9`（整合測試與驗收）→ 未來有雲環境：`setup-db` → `probe-tx` → CloudDB 契約測試 → 切換 bootstrap。
→ P6（真實支付）等商戶號。

### 每階段的固定流程

1. 先出**逐檔計畫**給使用者確認
2. 確認後才動代碼
3. 每個 commit 完成後回報：改了什麼、跑了什麼驗證、結果
4. 階段結束做**逐 commit 稽核**（逐一 `git checkout` + `npm run sync` + `npm run verify`）

---

## 7. 紅線與禁令

| # | 紅線 |
|---|---|
| 1 | **不動業務代碼**（`pages/`、`components/`、`model/`、`services/`、`app.json`）—— **P7a 階段已獲授權，限計畫列出的檔案** |
| 2 | **不動資料庫** |
| 3 | **不建階段外的雲函數** |
| 4 | **不在前端判斷角色權限** |
| 5 | **不讓師傅端取得客戶完整聯絡方式** |
| 6 | **不設計讓師傅繞過平台收款的流程** |
| 7 | **不刪除現有集合或功能**（除非明確同意） |
| 8 | **不把密鑰、商戶號、API v3 key 寫進前端或代碼庫** |
| 9 | **不為趕進度跳過支付、退款、分帳的測試** |
| 10 | **遇計畫外狀況停下來問，不要自行決定** |
| 11 | **不使用 `--no-verify` 繞過守衛** |

---

## 8. 關鍵文件索引

| 文件 | 內容 |
|---|---|
| `docs/00-現狀分析.md` | 改造前現狀：零後端、零雲函數、假支付 |
| `docs/01-目標架構.md` | **主架構文件**：五層分層、狀態機、17 集合、§1.6 依賴方向與 CI、§3.7 服務與商品、**§3.8 訂單生成與流轉契約**、§4.6 權限矩陣、§4.7 RBAC+ABAC、§4.8 身分與登入、§5 共享代碼方案、§9 支付風險與備案 |
| `docs/02-實施計畫.md` | P0–P10 各階段；§0.6 執行順序理由；§3.0 事務核實（已由路線 C 解決） |
| `docs/03-開發規範.md` | 後端規範：分層、禁制、部署 SOP |
| `docs/04-前端規範.md` | **前端規範**：五條紅線、角色顯示 vs 權限、師傅端資料範圍、微信平台限制 |
| `docs/P0-驗證報告.md` | P0 結果；§8 是使用者要執行的雲端驗證步驟 |
| **`docs/P2-0-文檔核實報告.md`** | **路線 C 結果**：事務與 inc 支援確認 + 三個架構限制 |
| `docs/P2-0-探針代碼.md` | 探針程式碼（**保留不執行**，P2 契約測試失敗時的診斷工具） |
| `docs/P2-計畫.md` | P2 逐檔計畫；§12 企業級補強（§A 審計不可篡改性 / §B 金額完整性 / §C 可追溯性與 SoD） |
| `docs/P4-計畫.md` / `P4ab-計畫.md` / `P4c-計畫.md` | P4 各子階段計畫（已完成） |
| `docs/P7a-計畫.md` / `P7a-1-計畫.md` / `P7a-2a-計畫.md` | P7a 各子階段計畫（`P7a-2a` 的 §12 是執行結果與偏離記錄） |
| **`docs/P7a-2a-T4-計畫.md`** | **T4（購物車頁）的細部計畫**：三個動手前發現、元件去留、結算流程落點、人工驗收 C1–C13（含 Storage 種子資料） |
| **`docs/P7a-2a-T3.6-計畫.md`** | **T3.6（分類頁）的計畫**：診斷（原始分類頁沒被改過，是 tabBar 指錯）、方案 A、二級分類資料模型、fake 資料、人工驗收 C1–C7 |
| **`docs/P7a-2a-T3.6.1-診斷報告.md`** | **4 個 bug 的診斷**（價錢為零／圖片不一致的真正位置在商品詳情頁，附證據）＋ 七問決議 |
| **`docs/P7a-2a-T6a-計畫.md`** | **T6a（詳情頁）的逐檔計畫 ＋ 執行結果**：規模（9 個入口、規格彈窗的合成與兩個既有問題）、服務／商品的差異、commit 切分、驗收 C1–C12 |
| **`docs/P7a-2a-T6a.1-診斷報告.md`** | **T6a.1（四個新需求）的診斷**：立即購買與 P7a2a-C2 的衝突、星星圖示的實情、內容超出頁面的兩個機制、卡片佈局 |
| **`docs/P7a-2a-T6a.2-診斷報告.md`** | **T6a.2（詳情頁內容超出）的診斷**：兩處固定寬度各超出 10rpx、缺 `overflow-x` 防線、四個檢查點的核對、其他頁面的稽核 |
| **`docs/P7a-2a-T6a.3-計畫.md`** | **T6a.3 逐檔計畫（✅ 已完成）**：資料形狀（維度 specs／skus／images）、commit 切分 A1／A2／B／C／D、驗收、風險、§7 執行結果 |
| **`docs/P7a-2a-T5-計畫.md`** | **T5（商品列表）逐檔計畫（✅ 已完成）**：現況診斷、純函式設計、搜尋／分類／排序／分頁、commit 切分、驗收 C1–C12 |
| **`docs/P7a-2a-T6b-計畫.md`** | **T6b（客服詢問）逐檔計畫（✅ 已完成）**：inquiries schema、本機 Storage、P5 Use Case 契約、驗收 C1–C9 |
| **`docs/P7a-2a-T7-計畫.md`** | **T7（結算頁）逐檔計畫（✅ 已完成）**：§3.8 契約、金額、地址、模擬提交、驗收 C0–C10 |
| **`docs/05-上雲部署手冊.md`** | **上雲 SOP**：repair-test、setup-db、probe-tx、四支核心函數、契約測試、apiMode／CloudDB bootstrap |
| **`docs/06-P6-微信支付預案.md`** | **P6 預案**：服務商分帳、PaymentGateway 擴充、回調驗簽／冪等、退款／回退流程圖 |
| **`docs/07-上雲後待辦清單.md`** | **TODO 盤點**：P0／P6／P7b／P7a-2b／P8／Toast／假資料／只寫未跑／舊電商殘留 |
| `docs/P1-計畫.md` / `P1-驗收報告.md` | P1 計畫與 23 項驗收 |
| **`docs/SESSION-HANDOFF.md`** | **本文件** |

---

## 9. 新 Session 的標準開場白

```
你現在是我的資深微信小程序雲開發架構師、六角形架構專家、
微信支付服務商分帳與退款專家。請用繁體中文回覆。

請先閱讀 docs/SESSION-HANDOFF.md（我貼在下面），那是完整的進度交接。
再依它的指示讀取相關文件。

工作方式：
1. 動手前先出逐檔計畫（改哪些檔、新增哪些檔、npm script、
   驗收標準、影響範圍、回滾方式），我確認後才動代碼
2. 每個 commit 完成後回報：改了什麼、跑了什麼驗證、結果
3. 每個階段結束做逐 commit 稽核（逐一 checkout + npm run sync + npm run verify）
4. 遇到計畫外狀況停下來問我，不要自行決定
5. 不要動業務代碼（P7a 階段除外，限計畫列出的檔案）、
   不要動資料庫、不要建階段外的雲函數

目前進度：P4c 完成、P7a-1 完成、**P7a-2a 7/7 全部完成**、**P2 全部完成（無雲環境模式）**、**P3／P5 完成（Mock 金流）**、**P8 Mock 後台完成**、**全局電話與首頁／訂單／我的資料對接完成**。
下一步：**P9（整合測試）**；P6 等商戶號；P7a-2b 延後。
特別注意：T6（商品詳情）要實作「加入購物車」寫入 utils/cart.js ——
在那之前購物車沒有生產者（T4 的人工驗收需先用 Storage 種子資料）。
T7（結算頁）必須移除 T4 留下的相容橋接，見 §6.2。

另外要求：
- 不要用 shell（bash）做含反引號或 ${} 的文字取代 ——
  上一個 session 因此弄壞過文件與測試三次，請一律用 Edit/Write 工具
- 若要在某階段中途停下（例如上下文快滿），主動說明並停在安全點

---以下為 SESSION-HANDOFF.md 全文---
（貼上完整內容）
```

---

## 10. 給接手者的四個提醒

1. **這份文件可能已過時**。若 Git 狀態與 §4 不符，以 `git log` 為準。
2. **`npm run verify` 必須隨時全綠**（依賴方向 + 前端檢查 + 共享碼同步 + **1369** 測試）。
   紅了先修，不要繼續往下做。
3. **兩個守衛會擋你，那是設計不是 bug**：
   - 改 `packages/` 後忘記 `npm run sync` → 雲函數拒絕啟動
   - `pages/` 出現權限判斷或未登記的撥號 → `check:frontend` 擋下
4. **⚠️ WXML 沒有任何編譯期檢查**（`npm run verify` 也跑不到）。
   打錯一個事件名或忘記在 `usingComponents` 註冊元件，**測試全綠但按鈕按了沒反應**。
   T4 的作法：改完 WXML 後跑一支**一次性腳本**核對三件事 ——
   WXML 的每個事件處理函式在對應 `.js` 存在、用到的自訂元件都有註冊、
   元件的 `triggerEvent` 名稱與頁面 `bind:` 名稱一致（腳本不進 repo）。
   **改 `pages/cart/**` 的 WXML 時請沿用這個習慣。**
