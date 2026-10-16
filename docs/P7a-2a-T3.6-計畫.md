# P7a-2a / T3.6 計畫 —— 分類頁（還原 TDesign 佈局 + 接新資料源）

> 產出日期：2026-10-16
> 分支：`refactor/hexagonal`（HEAD = `5416b7a`）
> **狀態：計畫。尚未動任何代碼。等你確認 §9。**
> 前置：`docs/01` §3.7／§3.7.9／§3.7.10、`docs/04-前端規範.md`、`docs/P7a-2a-T4-計畫.md`（同批次的作法）

---

## 0. 診斷結果 —— **與你的前提有三處不符**

在寫計畫前先跑了診斷，結果和你的判斷不一樣。**先講清楚，因為這會讓 T3.6 小很多。**

| 你的前提 | 實際情況 | 證據 |
|---|---|---|
| 「P7a-1 把 TDesign 原本的分類頁**改成了**服務列表」 | ❌ **`pages/category/` 從來沒有被改過**，仍是 TDesign baseline 原樣 | `git log --all --oneline -- pages/category` → 只有兩個 baseline commit（`a747010`／`1f38b93`），**P7a-1 完全沒動它** |
| 「從 git 歷史找到 P7a-1 **之前**的代碼來還原」 | ❌ **不需要還原**，原始佈局完整存在且可用 | `pages/category/index.*` + `components/goods-category`（含 `c-sidebar`／`c-tabbar` 共 19 個檔）都在 |
| 「`pages/service/` 或 `pages/category/`」 | ❌ `pages/service/`（單數）**不存在** | 只有主包 `pages/services/index`，是 P7a-1 **新建**的骨架（`5f0485c`） |

### 真正的原因（兩步，不是一步）

| 步驟 | 做了什麼 | 後果 |
|---|---|---|
| **P7a-1 T6** | tabBar 第 2 項指向**新建的骨架** `pages/services/index`；原本的 `pages/category/index` 離開 tabBar（A7：入口下線、代碼保留） | 點 tab 進去看到的是 P7a-1 的 placeholder「服務列表與分類將於 P7a-2 建置」 |
| **T3.5** | 只把**文字**「服務」改成「分類」，**沒改指向** | 「tabBar 寫分類 → 點進去是服務骨架」→ 你看到的**空殼** |

> **空殼是 `pages/services/index`，不是 `pages/category/index`。**
> 後者今天仍然可以正常顯示（只是資料是電商的「女裝／男裝」）。

### 這對 T3.6 的意義

**「還原 TDesign 佈局」這個工作基本上不存在** —— 它沒壞。
真正要做的是兩件事：

1. **把 tabBar 第 2 項指回 `pages/category/index`**（1 行 `app.json` + 1 行 `custom-tab-bar/data.js`）
2. **把它的資料源從舊電商 mock 接上新的 API 層**，並換成維修場景的分類資料

---

## 1. 現有資產盤點（可直接重用，不需重寫）

| 資產 | 內容 | 狀態 |
|---|---|---|
| `pages/category/index.js/.wxml` | 主包、**已註冊於 `app.json` 的 `pages`**、`onShow` 已在呼叫 `getTabBar().init()` | ✅ **本來就是 tabBar 頁**，指向即可 |
| `pages/category/components/goods-category` | 左側 `c-sidebar`（一級）＋右側三種模式 | ✅ 完整 |
| ↳ `level = 3` | 一級 sidebar → 右側列「二級標題 + **三級**項目的網格」 | ← **目前這頁用的模式** |
| ↳ `level = 2` | 一級 sidebar → 右側**二級項目**網格 | 可用 |
| ↳ **`isSlotRight = true`** | 一級 sidebar → 右側 **`c-tabbar`（二級 tabs）** ＋ `<slot>` | ← **這才是你要的佈局** |
| `components/goods-list` | `flex-wrap` + `goods-card`（342rpx）＝ **兩列網格** | ✅ 直接用於 slot，不必自己寫 |
| `components/goods-card` | 共用卡片（`thumb`／`title`／`price`／`specs`） | ✅ 與 T4 同一張卡 |

### 1.1 ⚠️ 唯一需要動元件的地方（1 行）

`goods-category/index.wxml:6` 目前是：

```xml
<c-tabbar wx:if="{{isSlotRight}}" activeKey="{{subActiveKey}}" bindchange="onChildChange" showMore>
```

**它沒有把 `tabList` 傳給 `c-tabbar`**，而 `c-tabbar` 的 WXML 是
`wx:if="{{ tabList.length > 0 }}"` —— 也就是說今天把 `isSlotRight` 設成 `true`，
**二級 tabs 會是空的**（因為 `tabList` 沒傳）。

**修正**：補上 `tabList="{{ category[activeKey].children }}"`（一級選中項的二級清單）。
這是 T3.6 對既有元件**唯一**的邏輯修改。

---

## 2. 方案選項（§9 Q-1 要你選）

| 方案 | 內容 | 成本 | 風險 |
|---|---|---|---|
| **A（建議）** | tabBar 指回**既有** `pages/category/index`；改它的資料源 + `isSlotRight` + slot 塞 `goods-list`；`pages/services/index` 保留不用 | **小** | 低 —— 佈局是原始資產，不重寫 |
| B | 把 `pages/services/index` 改寫成同樣佈局（＝重造一個已經存在的東西），或把 `pages/category/index` 搬家過去 | 中 | 中 —— 兩個分類頁並存，日後必混淆 |
| C | 只改 `app.json` 指向，資料不動 | 最小 | 低但**不符業務**（會顯示女裝／男裝） |

**我建議 A**：不動的東西就不動。TDesign 的佈局已經調好樣式，重寫只會製造風險
（與 T4 保留 `goods-card` 是同一個判斷）。

---

## 3. 資料模型（你的第 3 點，有一處必須修正）

| 你的敘述 | 處置 |
|---|---|
| `categories` 加 `parent_id`；一級 `parent_id = null`；二級 `parent_id = "cat_water"` | ✅ 照做 |
| **`catalog_items` 的 `category_id` 指向二級分類** | ⚠️ **改為「`services` 與 `products` 各自加 `category_id`」** |

**為什麼要改**：§3.7.10（**你已定案**）決定 `services` 與 `products` **維持分開**，
**沒有 `catalog_items` 這個集合**。所以分類關聯必須分別落在這兩張表上。

> 這正好回答了我在 §7.2 記下的未決項（「services／products 與 categories 的關聯欄位」）。
> T3.6 會把它寫成定案，不再是待確認。

**修正後的形狀**：

```js
categories: { _id, name, parent_id, icon, thumbnail, order, is_active }
//           parent_id === null → 一級分類；否則指向一級分類的 _id

services:  { ..., category_id }   // → 指向**二級**分類
products:  { ..., category_id }   // → 指向**二級**分類
```

---

## 4. Fake 資料（你的第 5 點）＋ 一個要你確認的語意問題

### 4.1 ⚠️ 你的例子裡有一個語意衝突

你寫的是：

- 二級分類（水）：**水管、水龍頭、熱水器**
- 商品：**水管維修、水龍頭安裝、熱水器清洗**

**「水管維修」是服務（人工），不是零件。** 而 §3.7.9 說「分類涵蓋**服務與零件**」。
所以「二級分類下的網格要顯示什麼」需要你定（§9 Q-2）：

| 選項 | 內容 | 評估 |
|---|---|---|
| (a) 只顯示服務 | 分類頁 = 服務目錄 | ❌ 與「分類涵蓋服務與零件」矛盾，零件沒有入口 |
| **(b) 服務 + 零件混合（建議）** | 同一張卡片，服務排前面 | ✅ 符合 §3.7.0(A)「兩者都用同一套商品卡片」；零件從這裡也能進 |
| (c) 二級之下再分兩段（服務／零件） | 網格分成兩個區塊 | 多了分組標題，畫面較滿；但語意最清楚 |

### 4.2 建議的 fake 資料（以 (b) 為前提）

| 一級 | 二級 | 掛在二級下的項目（服務＋零件） |
|---|---|---|
| **水** | 水管 / 水龍頭 / 熱水器 | 水管維修（服務）、水管疏通（服務）、PVC 彎頭（零件） |
| **電** | 線路 / 插座 / 燈具 | 線路檢修（服務）、插座更換（服務）、開關面板（零件） |
| **空調** | 清洗 / 維修 / 安裝 | 冷氣清洗（服務）、冷氣維修（服務）、冷媒 R410（零件） |
| **家具** | 組裝 / 維修 | 家具組裝（服務）、家具維修（服務）、五金配件包（零件） |

> 零件沿用既有 `prd-*`（冷媒 R410 等），這樣**購物車在 T3.6 之後就有入口了**
> —— 順帶解掉 T4 人工驗收「沒有加入購物車入口」的一半問題（加入動作仍要等 T6）。

---

## 5. 逐檔計畫

### 5.1 修改（既有檔案）

| # | 檔案 | 改動 | 風險 |
|---|---|---|---|
| M1 | `app.json` | tabBar 第 2 項 `pagePath`：`pages/services/index` → **`pages/category/index`**（文字「分類」不變） | 中（全站導覽） |
| M2 | `custom-tab-bar/data.js` | 第 2 項 `url` 同步改；更新註解（原本寫「路徑刻意不動」，現在改了） | 低 |
| M3 | `pages/category/index.js` | 改接新 API 層（`fetchCategories`／`fetchServices`／`fetchProducts`）；組合出 goods-category 要的樹；處理一級／二級切換與網格資料 | **中** |
| M4 | `pages/category/index.wxml` | `isSlotRight="{{true}}"` + `<goods-list>` slot；`bind:change` 接二級切換 | 中 |
| M5 | `pages/category/index.json` | `navigationBarTitleText`：「分类」→「**分類**」；`goods-list` 註冊（slot 內容用） | 低 |
| M6 | `pages/category/components/goods-category/index.wxml` | **補上 `tabList="{{ category[activeKey].children }}"`**（§1.1） | 低 |
| M7 | `services/api/_fake/data.js` | 新增 `CATEGORIES`（兩層）；`SERVICES`／`PRODUCTS` 各加 `categoryId` | 低 |
| M8 | `services/api/_fake/index.js` | 新增 `fetchCategories()` | 低 |
| M9 | `services/api/real/index.js` | `fetchCategories` 的 `notImplemented` 佔位（契約一致性測試會檢查） | 低 |
| M10 | `services/api/index.js` | 轉出 `fetchCategories` | 低 |

### 5.2 新增

| # | 檔案 | 職責 |
|---|---|---|
| N1 | `utils/categoryTree.js` | **純函式**：`buildCategoryTree({ categories, items })` → goods-category 要的兩層樹＋每個二級下的項目；`itemsOfLevel2(...)` |
| N2 | `tests/unit/frontend/categoryTree.test.js` | 對應測試（含 `parent_id` 為 null／孤兒二級／空的二級） |
| N3 | `docs/P7a-2a-T3.6-計畫.md` | 本文件 |

> **為什麼要 N1**：與 T4 的 `cartView` 同一個理由 —— 頁面在 CI 裡跑不到，
> 樹的組裝（過濾上下架、排序、把 items 掛到二級、孤兒分類的處理）必須能被測試。

### 5.3 文件修正（你的第 4 點）

| # | 檔案 | 改動 |
|---|---|---|
| D1 | `docs/01` §3.7.9 (2) | 佈局改為「左側一級／**右側頂部二級 tabs**／下方兩列網格」；刪掉「**不做二級分類**」，改為二級分類（並註明是 2026-10-16 T3.6 的修正） |
| D2 | `docs/01` §3.7.9 (4) | 資料模型：`categories` 加 `parent_id`；`catalog_items` 改為 `services`／`products` 各自的 `category_id` |
| D3 | `docs/01` §7.1 | `categories` 的說明由「不做二級分類，故無 parent_id」改為「**有 parent_id（兩層）**」 |
| D4 | `docs/01` §7.2 第 6／7 點 | 把我 T3.5 記下的「待 P2 定案（關聯欄位）」改為**已定案**（`category_id` 指向二級） |
| D5 | `docs/P7a-2a-計畫.md` | §12 追加 T3.6 的執行結果 |
| D6 | `docs/SESSION-HANDOFF.md` | 進度、§6 下一步、§8 文件索引 |

---

## 6. 驗收

### 6.1 自動化

| # | 驗收項 | 預期 |
|---|---|---|
| A1 | `npm run verify` | 全綠（現有 966 + 新增） |
| A2 | `categoryTree` 純函式測試 | 兩層組裝、孤兒二級不進樹、下架過濾、二級無項目 |
| A3 | `apiContract`：`fetchCategories` 在 fake／real／index 三處都有 | 通過（既有機制） |
| A4 | tabBar 仍恰為 5 項且全在主包 | 通過 |
| A5 | **WXML 靜態核對**（T4 的作法） | 事件／元件註冊／事件名三方一致（**`goods-category`、`c-tabbar`、`goods-list` 這次也要納入**） |

### 6.2 人工驗收（開發者工具）

| # | 驗收項 | 預期 |
|---|---|---|
| C1 | tabBar 第 2 項「分類」→ 進入分類頁（**不是** placeholder） | 目視 |
| C2 | 左側顯示 水／電／空調／家具 四個一級分類 | 目視 |
| C3 | 右側頂部顯示該一級的二級 tabs（例：水 → 水管／水龍頭／熱水器） | 目視 |
| C4 | 下方網格**兩列**顯示該二級下的項目（服務＋零件） | 目視 |
| C5 | 切換一級 → 二級 tabs 與網格跟著換；切換二級 → 網格跟著換 | 操作 |
| C6 | 畫面無電商殘留（女裝／男裝／卫衣…） | 目視 |
| C7 | 點項目 → 導向（**預期是舊的商品詳情頁，見 §7 R2**） | 操作 |

---

## 7. 風險與回滾

| # | 風險 | 對策 |
|---|---|---|
| R1 | 動 `app.json` 的 tabBar 指向 → 全站導覽 | 單獨 commit + tag `pre-p7a2a-t36`；回滾 `git reset --hard pre-p7a2a-t36` |
| R2 | **點項目後導向的是舊頁面**：服務詳情（P7a-2b 才有）與商品詳情（T6）都還不是新版 | 與 T4 同一處理：導向 `/pages/goods/details/index?productId=…` 並在 commit 記錄過渡狀態；**T5／T6／P7a-2b 各自收斂** |
| R3 | `pages/services/index` 變成沒人指向的骨架 | **不刪**（紅線 7）。在它的檔案註解標明「已由 `pages/category/index` 取代，保留不刪」 |
| R4 | `goods-category` 加了 `tabList` 綁定後，舊的 `level=3` 模式若還有人用會受影響 | 目前已無人用（`grep` 確認 `isSlotRight` 從未被設 true、無其他頁面引用此元件）；改動只影響 `isSlotRight` 分支 |
| R5 | 分類頁在 `onShow` 抓資料，切 tab 會重抓 | fake 有 120ms 延遲，可接受；P7b 應加快取（記在 §9 Q-4） |

---

## 8. 明確不在 T3.6 範圍

| 項目 | 屬於 |
|---|---|
| 服務詳情頁 | P7a-2b |
| 商品列表的**改造**（二級分類 → 商品列表的篩選） | T5 |
| 商品詳情、加入購物車 | T6 |
| 首頁「常用零件／熱門服務」區塊順序調整 | P7a-2b |
| 後台的分類管理介面 | P8 |
| 真實 `categories` 集合（寫進雲資料庫） | P2 |

---

## 9. 待你確認（✅ 已於 2026-10-16 回覆）

| # | 問題 | 決議 |
|---|---|---|
| **Q-1** | 方案 A／B／C？ | ✅ **A** —— tabBar 指回 `pages/category/index`，不重寫佈局。唯一要動的元件是 `goods-category/index.wxml:6` 補 `tabList` |
| **Q-2** | 二級分類下的網格顯示什麼？ | ✅ **(b) 服務 + 零件混合**，排序規則「**服務在上、零件在下**」；各自按 `order` 排序 |
| **Q-3** | fake 資料清單 | ✅ 照 §4.2；**補充：fake 要能觸發 T4 的四種邊界情況**（庫存不足／下架／不存在／價格變動） |
| **Q-4** | `pages/services/index` 的處置 | ✅ 保留不刪，加註解（文字見 §5.1 M11） |
| **Q-5** | 二級 tab 的「查看全部」 | ✅ 留到 T5 |
| **Q-6** | `docs/01` §3.7.9 的修正寫法 | ✅ 保留原文 + 註明修正（格式見 §5.3 D1） |

### 9.1 Q-2 的規則（使用者指定）

```js
fetchCatalogByCategory(categoryId):
  1. 查 services  where category_id = categoryId, is_active = true
  2. 查 products  where category_id = categoryId, is_active = true
  3. 合併：services 先、products 後
  4. 各自按 order 排序
Service 與 Product 都實作 CatalogItem 介面，前端用同一個卡片元件渲染。
```

> ⚠️ **實作位置與上述字面不同**（見 §10.1）：規則寫成**純函式**（可測），
> 由頁面組合；**不新增 `fetchCatalogByCategory` API 方法**。理由與 P7b 的影響寫在 §10.1。

### 9.2 額外修正（category_id）

使用者確認：`services` 與 `products` **各自加 `category_id`**，**沒有 `catalog_items` 集合**。

---

## 10. 實作補充（§9 回覆後的兩處調整）

### 10.1 為什麼不新增 `fetchCatalogByCategory()` API 方法

| 面向 | 評估 |
|---|---|
| 規則必須可測 | `services 先、products 後、各自按 order` 是**呈現／業務規則**，若寫在 `services/api/_fake/index.js`（ESM）就無法被 `node:test` 直接載入（本專案既有作法是讓 fake 的 **data.js 用 CJS** 以便測試，但 index.js 不是） |
| 避免 API 層與 utils 互相依賴 | 若 fake 反過來 require `utils/`，會多一條不明確的依賴方向 |
| P7b 的影響 | 頁面改成打後端端點時，只要把「一行組合」換成「一次 API 呼叫」，**UI 完全不動**（符合 `docs/04` §4.1 的意圖） |

**因此**：規則寫在 `utils/catalogView.js` 的純函式 `mergeByCategory()`，
由頁面組合；API 層只新增真正的新資料需求 `fetchCategories()`。

### 10.2 新增欄位：`order`

Q-2 的排序需要 `services`／`products` 有 `order` 欄位（**`docs/01` §7.1 原本沒有定義**）。
處理：純函式用 `item.order ?? 0`，維持穩定排序；fake 資料補上 `order`；
並在 `docs/01` §7.2 記明這個欄位（連同 `category_id`）。

---

**⏸ §9 已回覆，開始執行。**（T4 的人工驗收 C1–C13 不受本計畫影響，隨時可做。）
