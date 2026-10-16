# P7a 逐檔計畫（待你確認）

> 產出日期：2026-10-16
> 分支：`refactor/hexagonal`（P4a／P4b／P4c 已完成）
> 前置：`docs/02-實施計畫.md` §0.7、`docs/01-目標架構.md` §4.8
> **狀態：計畫。未動任何代碼。**
> **依賴：P4（已完成）—— 用 in-memory fake，不依賴 P5。**

---

## 0. ⚠️ 先確認一件事：本階段會動 `pages/`

**你的紅線之一是「不動業務代碼（`pages/`、`components/`、`model/`、`services/`、`app.json`）」。**

P7a 的定義就是**前端改造**，必然要動這些目錄。因此本階段需要你**明確解除該紅線**（僅限本階段、僅限列出的檔案）。

**我在計畫中做了三個降低風險的安排：**

| # | 安排 | 目的 |
|---|---|---|
| 1 | **只改「入口與分發」，不改既有頁面的內部邏輯** | 現有電商頁面在 P7a 結束時仍可運作 |
| 2 | **每個既有檔案的改動單獨 commit** | 可逐檔 revert，不必整階段回滾 |
| 3 | **用 Feature Flag 保護**（`config.repairMode`） | 任何一頁改壞可單獨切回舊行為（Q3 決策：限頁面層級） |

---

## 1. 設計原則

### 1.1 Fake API 層：讓 UI 能在 P5 之前開發

P7a 依賴 P4（領域模型），但**不依賴 P5（Use Case）**。做法：

```
pages/*  →  services/api/  →  ┌─ _fake/  （P7a：記憶體假資料）
                              └─ real/   （P7b：呼叫雲函數）
```

`services/api/index.js` 依 `config.useMock` 切換。**UI 只依賴 API 的形狀，不依賴實作。**

### 1.2 ⚠️ 一個必須先講清楚的限制：前端不能 import `packages/`

我們在 P0 的 F1 修正中把 `packages/` 放進 `packOptions.ignore`，**避免 domain 原始碼被打包進前端**（那會撐大體積、且讓領域邏輯暴露在客戶端）。

**後果**：前端**無法共用** domain 的 DTO 定義，必須自己維護 view model。

| 風險 | 對策 |
|---|---|
| fake 的資料形狀與真實 DTO 走鐘 | ① 形狀以 `docs/01` 的 DTO 規格為準 ② **P7b 的端到端測試**會抓到不一致 |

**這是有意識的取捨**：換來的是前端 bundle 不含領域邏輯。

### 1.3 前端只決定「顯示什麼」，不決定「能做什麼」

- ✅ 允許：依角色決定 tabBar 項目、顯示哪些按鈕
- ❌ 禁止：依角色決定「能不能送出」——那是後端 `AccessPolicy` 的事

**CI 會擋**：`pages/**` 不得引用 `AccessPolicy`／`can(`／`permission`。

---

## 2. 既有檔案修改（逐檔，12 檔）

| # | 檔案 | 改動摘要 | 風險 |
|---|---|---|---|
| M1 | `custom-tab-bar/data.js` | 四項改為 `首頁 / 服務 / 訂單 / 我的`，並改為**依角色回傳**的函式 | **中**（所有頁面都會用到） |
| M2 | `custom-tab-bar/index.js` | 依 `role` 選 tabBar 項目；師傅／客服走各自的工作台 | 中 |
| M3 | `app.js` | 啟動時呼叫 `getMyRole()` → 路由分發（`utils/roleRouter`） | **中**（啟動路徑） |
| M4 | `app.json` | 新增 4 個分包（`pages/service`、`technician`、`cs`、`workorder`）；**既有分包保留**（入口下線、代碼保留，A7） | 中 |
| M5 | `config/index.js` | 新增 `repairMode` Feature Flag（頁面層級）與 `apiMode` | 低 |
| M6 | `pages/home/home.js/.wxml` | 改造為**服務首頁**（服務分類入口、熱門服務） | **高**（現有首頁） |
| M7 | `pages/usercenter/index.js/.wxml` | 改造為「我的」：訂單、地址、工單入口；**移除購物車／優惠券／發票入口** | 中 |
| M8 | `pages/order/order-list/index.js` | 對接新狀態機的狀態顯示（含 `VOIDED`、`EXPIRED_*`） | 中 |
| M9 | `pages/order/order-detail/index.js` | 同上；新增「申請退款」「聯繫客服」入口 | 中 |
| M10 | `pages/order/components/order-button-bar/index.js` | 按鈕依**角色 × 狀態**顯示（純顯示邏輯） | 中 |
| M11 | `pages/order/components/customer-service/index.js` | ⚠️ **移除 `wx.makePhoneCall` 直撥能力**（`docs/00` §5.4 的既有風險） | **中**（有回歸風險） |
| M12 | `pages/cart/index.js`、`pages/coupon/**` | **僅移除入口**，代碼保留並標 `@deprecated` | 低 |

> **M11 是資安相關的既有風險**：該元件的 `wx.makePhoneCall` 可以直接吃任意號碼。
> 師傅端若複用到它，就等於把客戶號碼餵進去。P7a 一併處理。

---

## 3. 新增檔案

### 3.1 API 層（6 檔）

| # | 路徑 | 職責 |
|---|---|---|
| N1 | `services/api/index.js` | API 入口，依 `config.apiMode` 切換 fake／real |
| N2 | `services/api/_fake/index.js` | fake 實作：`getMyRole`、`fetchServices`、`fetchServiceDetail`、`fetchMyOrders`、`fetchOrderDetail`、`fetchTechnicianTasks`、`fetchCsWorkbench`、`fetchWorkOrder` |
| N3 | `services/api/_fake/data.js` | 假資料（含**刻意放入的完整客戶資料**，用來驗證師傅端 UI 不會顯示） |
| N4 | `services/api/real/index.js` | **佔位**：一律拋「P7b 實作」，避免誤用 |
| N5 | `utils/roleRouter.js` | 依角色決定首頁並 `reLaunch` |
| N6 | `utils/roleVisibility.js` | 依角色決定顯示（**不是權限**，註解需明寫） |

### 3.2 新增頁面（每個頁面 4 檔：`.js/.wxml/.wxss/.json`）

| # | 頁面 | 角色 | 職責 |
|---|---|---|---|
| N7 | `pages/service/list/` | 客戶 | 服務列表（分類、搜尋） |
| N8 | `pages/service/details/` | 客戶 | 服務詳情 + **預約時間選擇** + 加入訂單 |
| N9 | `pages/technician/index/` | 師傅 | 工作台：今日任務、接單狀態 |
| N10 | `pages/technician/task-detail/` | 師傅 | 任務詳情：**區域級地址**、脫敏電話、接單／到場／完工 |
| N11 | `pages/technician/earnings/` | 師傅 | 我的報酬（含分帳狀態、「報酬待對帳確認」） |
| N12 | `pages/cs/index/` | 客服 | 派單工作台：待派單列表、師傅可用狀態 |
| N13 | `pages/cs/order-detail/` | 客服 | 訂單管理：**完整客戶資料**、派單／改派、退款審核入口 |
| N14 | `pages/cs/workorder/` | 客服 | 工單列表與回覆 |
| N15 | `pages/workorder/chat/` | 客戶／師傅 | 與客服的工單對話（**唯一的雙向溝通管道**） |

> **共 9 頁 × 4 檔 = 36 檔。**

### 3.3 頁內元件（6 檔）

| # | 路徑 | 職責 |
|---|---|---|
| N16 | `pages/technician/components/task-card/` | 師傅任務卡片（脫敏顯示） |
| N17 | `pages/technician/components/masked-contact/` | **只顯示 MaskedPhone 與「聯繫客服」按鈕**，不提供直撥 |
| N18 | `pages/cs/components/assign-sheet/` | 派單面板（選師傅） |
| N19 | `pages/cs/components/order-full-card/` | 客服視角的完整訂單卡 |
| N20 | `pages/service/components/time-slot-picker/` | 預約時段選擇 |
| N21 | `pages/workorder/components/message-list/` | 工單訊息列表 |

### 3.4 測試與文件（3 檔）

| # | 路徑 | 職責 |
|---|---|---|
| N22 | `scripts/check-frontend.js` | **前端專屬 CI**：禁止 `pages/**` 引用權限邏輯、禁止師傅端出現直撥 |
| N23 | `tests/unit/frontend/roleRouter.test.js` | 路由分發的純函式測試 |
| N24 | `docs/04-前端規範.md` | 前端紅線（不判斷權限、師傅端資料限制） |

**合計新增：6 + 36 + 6 + 3 = 51 檔。**

---

## 4. npm script 變更

| script | 動作 |
|---|---|
| `check:frontend` | **新增**：`node scripts/check-frontend.js` |
| `verify` | **修改**：加入 `check:frontend` |

**不動任何依賴。**

---

## 5. 驗收標準（逐項可驗證）

### 5.1 自動化

| # | 驗收項 | 指令 | 預期 |
|---|---|---|---|
| P7a-A1 | 前端 CI 通過 | `npm run check:frontend` | `exit=0` |
| P7a-A2 | **`pages/**` 不得引用權限邏輯** | 同上（內含規則） | `AccessPolicy`／`can(`／`permission` 出現次數 **0** |
| P7a-A3 | **師傅端不得出現直撥** | 同上 | `pages/technician/**` 內 `wx.makePhoneCall` 出現次數 **0** |
| P7a-A4 | 路由分發正確 | `npm test`（roleRouter 測試） | 四角色各自導向正確首頁 |
| P7a-A5 | 既有測試不受影響 | `npm test` | 783 個測試**一個都不紅** |
| P7a-A6 | `npm run verify` | — | 全綠 |

### 5.2 靜態

| # | 驗收項 | 指令 | 預期 |
|---|---|---|---|
| P7a-B1 | **領域邏輯未進前端 bundle** | 確認 `project.config.json` 的 `packOptions.ignore` 仍含 `packages` | 仍在 |
| P7a-B2 | 未刪除任何既有頁面 | `git diff --diff-filter=D` | **空**（下線＝只移入口） |
| P7a-B3 | 未刪除任何既有集合／雲函數 | `ls cloudfunctions/` | 5 支不變 |
| P7a-B4 | 依賴未變 | `git diff -- package.json` 的依賴區塊 | **空** |

### 5.3 人工驗收（需你在開發者工具確認）

| # | 驗收項 | 方式 |
|---|---|---|
| P7a-C1 | 四角色登入後導向正確頁面 | 用不同 openid 測試（可直接改 fake `getMyRole` 回傳值） |
| P7a-C2 | tabBar 依角色變化 | 目視 |
| P7a-C3 | **師傅端任務詳情看不到完整地址與手機號** | 目視（fake 資料刻意含完整值） |
| P7a-C4 | 購物車／優惠券／發票**無入口可達** | 逐一檢查 tabBar、我的、訂單頁 |
| P7a-C5 | 既有訂單頁（未改造部分）仍可運作 | 目視 |

### 5.4 負向測試

| # | 故意違反 | 預期 |
|---|---|---|
| P7a-N1 | 在 `pages/technician/**` 加 `wx.makePhoneCall` | `check:frontend` 擋下 |
| P7a-N2 | 在 `pages/**` import `AccessPolicy` | `check:frontend` 擋下 |
| P7a-N3 | 在客服頁顯示師傅完整報酬以外的敏感欄位 | 待 P7b 端到端測試（P7a 僅 fake） |

---

## 6. 影響範圍與回滾

| 任務 | 動業務代碼？ | 動資料庫？ | 回滾 |
|---|---|---|---|
| T1 API 層（N1–N6） | ❌（新增） | ❌ | `git revert` |
| T2 新增頁面（N7–N21） | ❌（新增） | ❌ | `git revert` |
| T3 tabBar 與路由（M1–M5） | ✅ | ❌ | **逐檔 revert**；或把 `repairMode` 設 false |
| T4 首頁／我的改造（M6–M7） | ✅ | ❌ | **逐檔 revert**（單獨 commit） |
| T5 訂單頁對接（M8–M10） | ✅ | ❌ | 逐檔 revert |
| T6 **撥號隔離（M11）** | ✅ | ❌ | 單獨 commit，可 revert |
| T7 下線入口（M12） | ✅ | ❌ | 逐檔 revert |

**整體回滾**：`git reset --hard <P4c 最後 commit>`。
**⚠️ 這是第一個有「改壞既有功能」風險的階段** —— 因此：
- 每個既有檔案的改動**單獨 commit**
- 改動前先 `git tag pre-p7a-<page>`
- Feature Flag 讓單頁可切回舊行為

---

## 7. 執行順序

```
T1  API 層（fake）+ roleRouter + roleVisibility        → commit
T2  check-frontend.js + 前端規範文件                    → commit → npm run verify
T3  tabBar 角色化（M1–M2）                              → commit（單獨，影響全站）
T4  路由分發（M3–M5）                                   → commit
T5  新增頁面：service / technician / cs / workorder     → commit
T6  首頁改造（M6）                                      → commit → tag pre-p7a-home
T7  「我的」改造（M7）                                  → commit → tag pre-p7a-usercenter
T8  訂單頁對接（M8–M10）                                → commit
T9  撥號隔離（M11）                                     → commit（單獨，資安相關）
T10 下線入口（M12）                                     → commit
    ── 完整驗收 + 逐 commit 稽核 ──
```

**每個 T 結束都跑 `npm run verify` 並回報。**

---

## 8. 我需要主動指出的風險

| # | 風險 | 說明與對策 |
|---|---|---|
| P7a-R1 | **這是第一個會改壞既有功能的階段** | 既有電商頁面正在運作。對策：逐檔 commit + tag + Feature Flag |
| P7a-R2 | **fake 的 DTO 形狀可能與真實走鐘** | 前端無法 import `packages/`（F1 的刻意設計）。對策：P7b 的端到端測試會抓；也可在 P7b 加「fake vs real 契約測試」 |
| P7a-R3 | **51 個新檔案，是 P4c 的 1.6 倍** | 若太大，可拆成 P7a-1（基礎設施＋tabBar／路由）與 P7a-2（新增頁面） |
| P7a-R4 | 前端「顯示邏輯」與「權限邏輯」容易混淆 | 用一句話當判準：**把前端全刪掉，系統仍必須安全**。若某規則刪掉前端就失效，它寫錯地方了 |
| P7a-R5 | `check-frontend.js` 是新的檢查器，本身可能有漏洞 | 沿用 P0 的做法：**先寫負向測試**，確認它真的會擋 |
| P7a-R6 | M11（撥號隔離）可能影響現有客戶端頁面 | 該元件目前出現在客戶端訂單頁（撥號對象是商家客服，非客戶號碼）。**移除直撥後需確認客服入口仍可用**（改為導向工單） |

---

## 9. 待你確認

| # | 問題 | 阻塞什麼 |
|---|---|---|
| **Q-A** | **是否解除「不動 `pages/`」紅線**（僅限本階段、僅限列出的檔案）？ | 全部 |
| **Q-B** | 51 檔是否拆成兩次回報（P7a-1 基礎設施＋tabBar／路由；P7a-2 新增頁面）？ | 執行節奏 |
| **Q-C** | M11 移除撥號後，客戶端的「聯繫客服」要改為**導向工單**——確認？ | M11 |
| **Q-D** | 服務首頁要不要保留部分電商內容（例如「推薦商品」區塊），還是純服務？ | M6 |
| **Q-E** | 師傅端「我的報酬」是否顯示分潤比例？（`docs/01` §4.6 明訂師傅**不得**看到比例，只能看到金額） | N11 |

---

**⏸ 等你回覆 §9，以及 P2-0 探針結果（決定 P2 的實作方式）。

**依你的指示，P8 暫緩** —— P5 完成後再出。**
