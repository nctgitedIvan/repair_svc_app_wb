# P7a-2a / T5 逐檔計畫 —— 商品列表（服務與零件）

> 產出日期：2026-10-17
> 分支：`refactor/hexagonal`（HEAD = `591a27b`，T6a.3 已完成）
> **狀態：計畫。未動任何代碼。**
> 依據：`docs/P7a-2a-計畫.md` M4、`docs/01` §3.7（服務與商品）、`docs/04-前端規範.md`、T6a.3 後的資料模型

---

## 1. 現況診斷（`pages/goods/list`）

| # | 問題 | 證據 |
|---|---|---|
| D1 | **資料源是舊電商 mock** | `index.js:1` 引用 `services/good/fetchGoodsList` → `model/search.getSearchResult()`，回傳 `spuId`／`primaryImage`／`minSalePrice`，與新 API 無關 |
| D2 | **欄位是舊模型** | `fetchGoodsList.js:12-20` 把 `primaryImage` 塞回 `thumb`、`minSalePrice` 塞成 `price`；`originPrice` 是電商劃線價 |
| D3 | **點卡片會找不到商品** | `gotoGoodsDetail()` 用 `?spuId=`；T6a 後詳情頁只認 `productId`／`serviceId`，`spuId` 僅是過渡相容 → 目前可預期「找不到這件商品」 |
| D4 | **篩選／排序實際無效** | `handleFilterChange()` 只 `setData` 了 `overall/sorts/layout`，但 `generalQueryData()` 讀的是 `this.data.filter`；`filter` 從未更新 → 綜合／價格排序都不會改變查詢 |
| D5 | **沒有關鍵字入口** | `generalQueryData()` 讀 `this.data.keywords`，但頁面沒有任何搜尋框，`keywords` 永遠是 `undefined` |
| D6 | **分頁狀態會卡死** | `init()` 失敗時沒有把 `loadMoreStatus` 歸零；之後 `onReachBottom` 會直接 return |
| D7 | **價格區間確認有 bug** | `confirm()` 在「只有最高價」時顯示 `0-${minVal}`（應為 `maxVal`），且範圍錯誤仍會送出 |
| D8 | **加購只是 Toast** | `handleAddCart()` 固定顯示「点击加购」，沒有寫入購物車，也沒有處理規格／服務 |
| D9 | **空態只有一種** | 目前把「查無資料」與「載入失敗」混為一談，失敗時使用者無從重試 |

**結論**：這一頁不是「小改接線」，而是**保留版面元件、重寫資料與互動層**。

---

## 2. 目標行為

```
fetchCategories() ─┐
fetchServices()   ─┼→ this.catalog（快取，只抓一次）
fetchProducts()   ─┘
        ↓
catalogView.mergeCatalog()       ← 過濾下架、預設「零件在上、服務在下」
        ↓
catalogView.filterCatalogItems() ← 分類＋關鍵字＋價格區間
        ↓
catalogView.sortCatalogItems()   ← 綜合／價格升／價格降
        ↓
catalogView.paginateItems()      ← 本機分頁（pageSize 見 §4.4）
        ↓
catalogView.toCardModel()        ← images[0]、tags、isSoldOut
        ↓
components/goods-list（既有卡片，不改元件）
```

**頁面只負責**：事件、快取、Toast、導覽、購物車寫入；所有規則都在 `utils/catalogView.js`（純函式，有測試）。

---

## 3. 逐檔計畫

### 修改（M）

| # | 檔案 | 改動 |
|---|---|---|
| M1 | `utils/catalogView.js` | 新增 `mergeCatalog()`／`filterCatalogItems()`／`sortCatalogItems()`／`paginateItems()`；`toCardModel()` 補 `isSoldOut` 與「已售完」標籤（Q-2 已確認） |
| M2 | `pages/goods/list/index.js` | 移除 `fetchGoodsList`；改抓三個新 API 並快取；查詢參數（`category`／`keyword`）；分類 chip／搜尋／排序／價格區間／分頁狀態；卡片導覽與加購 |
| M3 | `pages/goods/list/index.wxml` | 新增 `t-search`、一級分類 chips；沿用 `filter`／`filter-popup`／`goods-list`／`load-more`；新增載入失敗的重試畫面 |
| M4 | `pages/goods/list/index.wxss` | 搜尋列、分類 chips、重試畫面的樣式；保留既有卡片與 popup 樣式 |
| M5 | `pages/goods/list/index.json` | 註冊 `t-search`；標題維持「商品列表」（Q-4 已確認） |
| M6 | `tests/unit/frontend/catalogView.test.js` | 新增四個純函式與 `isSoldOut` 的測試（含真實 fake 資料的整合測試） |
| M7 | `docs/P7a-2a-T5-計畫.md` | 本文件 |
| M8 | `pages/category/index.js` | （Q-3 已確認）「有規格 → 請至詳情」的 Toast 改為導向商品詳情；其餘行為不動 |

### 新增（N）

無新增執行檔。**不新增頁面、不新增雲函數、不改資料庫。**

### 刻意不動

| 檔案／元件 | 原因 |
|---|---|
| `components/goods-list`／`goods-card` | 卡片欄位已由 `toCardModel()` 適配，不需要改元件 |
| `components/filter`／`filter-popup` | 沿用既有的「綜合／價格／篩選」事件，只修頁面的處理邏輯 |
| `pages/goods/search`／`pages/goods/result` | 舊搜尋頁未排程；T5 的關鍵字在列表頁本機過濾，不涉及它們 |
| `services/good/*`、`model/*` | 舊電商 mock，留給後續清理；T5 不再引用即可 |

---

## 4. 功能規格

### 4.1 API 與快取

```js
const [categories, services, products] = await Promise.all([
  fetchCategories(),
  fetchServices(),
  fetchProducts(),
]);
this.catalog = { services: services.list, products: products.list };
this.categories = catalogView.buildCategoryTree(categories.list);
```

- 只在 `onLoad` 抓一次；搜尋／排序／分頁都在本機計算，**不重打 API**。
- 取不到 → `loadError = true`，顯示「重新載入」；**不顯示空態**（避免把失敗誤認為沒有資料）。

### 4.2 查詢參數（`onLoad(query)`）

| 參數 | 用途 | 預設 |
|---|---|---|
| `category` | 一級分類名稱（例：`空調`） | 空＝全部 |
| `keyword` | 初始關鍵字 | 空 |
| `itemType` | **選用**：`service`／`product`，供未來入口指定 | 空＝全部 |

> `categoryId`（二級）暫不支援：T5 的分類 chips 是一級分類；二級瀏覽仍由 `pages/category` 負責。

### 4.3 篩選與排序（純函式）

```js
filterCatalogItems(items, {
  keyword,         // trim、轉小寫；比對 name／nameEn／description
  category,        // item.category === category（一級名稱）
  minPriceCents,   // 含
  maxPriceCents,   // 含
})

sortCatalogItems(items, sorts)  // ''（綜合）｜'asc'｜'desc'
```

| 模式 | 規則 |
|---|---|
| 綜合 | 維持 `mergeCatalog()` 的順序：**零件在上、服務在下**，各自按 `order`（Q-1 已確認） |
| 價格升／降 | `priceCents` 排序；同價保持原順序（穩定排序，不讓每次載入跳動） |
| 價格區間 | 元件輸入的是「元」，頁面轉成分；`min > max` → Toast 並**不關閉 popup**、不重算 |

### 4.4 分頁

```js
paginateItems(items, { page, pageSize }) // → { list, total, hasMore }
```

- `pageSize = 10`。**理由**：fake 目前只有 11 個服務＋7 個零件（18 筆），設 30 永遠不會觸發載入更多，人工驗收看不到分頁。P7b 接真後端時可改 20–30。
- 第 1 頁：`goodsList = result.list`；`onReachBottom` 且 `hasMore` → 取下一頁並 `concat`。
- 篩選／搜尋／排序變更 → 重設 `pageNum = 1`、`goodsList = []`、`loadMoreStatus = 0`。
- 已到底 → `loadMoreStatus = 2`（`load-more` 顯示「沒有更多了」）。

### 4.5 卡片、導覽與加購

| 動作 | 商品 | 服務 |
|---|---|---|
| 點卡片 | `/pages/goods/details/index?productId=<id>` | `/pages/goods/details/index?serviceId=<id>` |
| 卡片加購圖示 | 無規格 → `cartRules.addItem()`；有規格 → **導向詳情頁選規格**（T6a 已完成）；已售完 → Toast「此商品已售完」 | Toast「服務請直接下單，無需加入購物車」（§3.7.2） |

- 下架項目在 `mergeCatalog()` 就被濾掉，不會出現在列表。
- 加購成功／失敗照 `utils/cart.js` 的 `CartCode` 顯示訊息（與分類頁一致）。

### 4.6 空態、錯誤與載入

| 狀態 | 畫面 |
|---|---|
| 載入中 | `loading`（沿用 `load-more` 的 loading 狀態；不閃空態） |
| 載入失敗 | 重新載入按鈕；`loadError = true` |
| 成功但 0 筆 | `t-empty`「沒有符合條件的服務或零件」＋「清除篩選」按鈕 |
| 有資料 | 卡片清單 ＋ `load-more` |

---

## 5. Commit 切分

| # | commit | 內容 | 驗證 |
|---|---|---|---|
| **T5-1** | 資料接線 | M1（純函式＋測試）＋ M2（只改資料源、映射、導覽、加購）＋ WXML 維持可渲染 | `npm run verify` 全綠；新測試覆盖四個函式 |
| **T5-2** | 列表 UI | M3／M4／M5 的搜尋、分類 chips、排序、價格區間、分頁與樣式 | `npm run verify`；人工 C1–C6 |
| **T5-3** | 空態與邊界 | 載入失敗重試、空態清除篩選、已售完標籤與加購守門、分頁狀態修正；M8 分類頁有規格改導向詳情 | `npm run verify`；人工 C7–C10、C12 |
| **T5-4** | 文件 | 本計畫狀態、`SESSION-HANDOFF.md` §2／§4／§6、`P7a-2a-計畫.md` 的 T5 狀態 | `npm run verify` |

> 每個 commit 前用 `npm run verify > verify.log 2>&1; echo $?` 檢查真實退出碼；不使用管線串接 commit。
> 每個 commit 後回報：改了什麼、驗證結果、退出碼。

---

## 6. 驗收

### 6.1 自動

| # | 項目 | 預期 |
|---|---|---|
| A1 | `npm run verify` | 每個 commit exit 0 |
| A2 | 新純函式測試 | `mergeCatalog`／`filterCatalogItems`／`sortCatalogItems`／`paginateItems`／`isSoldOut` 全過 |
| A3 | 真實 fake 資料 | 18 筆中只保留上架項目；`prd-3`（stock 0）標「已售完」；`prd-4`（下架）不出現 |
| A4 | 既有測試 | 除刻意新增外不紅 |

### 6.2 人工

| # | 操作 | 預期 |
|---|---|---|
| C1 | 進入 `pages/goods/list` | 卡片主圖是 `dz-*` 佔位圖，名稱／價格正確，服務與零件都有「服務／零件」標籤 |
| C2 | 搜尋「冷媒」／「清洗」／「Refrigerant」 | 分別命中零件、服務、英文名；清空後恢復全部 |
| C3 | 點分類 chip「水」 | 只剩 `category === '水'` 的項目 |
| C4 | 價格升／降 | 順序正確；同價不亂跳 |
| C5 | 價格區間 5–30 元 | 只顯示區間內項目；`min > max` 顯示錯誤且不套用 |
| C6 | 捲到底 | 載入第 2 頁；到底顯示「沒有更多了」 |
| C7 | 點零件卡片 | 進商品詳情（`productId`），**不再出現「找不到這件商品」** |
| C8 | 點服務卡片 | 進服務詳情（`serviceId`），顯示時長與技能標籤 |
| C9 | 卡片加購圖示 | 無規格零件加入購物車；有規格零件導向詳情；服務／售完給對應 Toast |
| C10 | 斷網／重試、空態 | 失敗顯示重試；無結果顯示空態與「清除篩選」 |
| C11 | 橫向溢出 | 無左右滑動（沿用 T6a.2 的防線） |
| C12 | 分類頁點「有規格」商品的加購圖示 | 導向該商品詳情（不再只給 Toast），可選規格 |

---

## 7. 已確認的四點（2026-10-17）

| # | 問題 | 決議 |
|---|---|---|
| **Q-1** | 預設排序：零件在上，還是服務在上？ | ✅ **零件在上**。這一頁是「商品列表」、入口是購物車的「去逛逛零件」；分類頁維持服務在上不變 |
| **Q-2** | 卡片是否顯示「已售完」標籤？ | ✅ **是**。`toCardModel` 加 `isSoldOut` 與標籤，分類頁也一致受惠 |
| **Q-3** | 是否順手修正分類頁的「有規格 → Toast」？ | ✅ **是**，納入 T5-3；會多改 `pages/category/index.js` |
| **Q-4** | 頁面標題維持「商品列表」還是改「服務與零件」？ | ✅ **維持「商品列表」** |

---

## 8. 紅線檢查

| 紅線 | T5 是否觸及 |
|---|---|
| 不動資料庫 | ✅ 不觸及 |
| 不建雲函數 | ✅ 不新增 |
| 不動 `pages/` 以外？ | 只改 `pages/goods/list/**` 與已確認的 `pages/category/index.js`（M8） |
| 頁面只能透過 `services/api/index.js` 取資料 | ✅ 只用 `fetchCategories`／`fetchServices`／`fetchProducts` |
| 不在前端判斷權限 | ✅ 不涉及角色／權限 |
| 服務不進購物車 | ✅ 加購分流由 `addActionFor()` ＋ `cart.addItem()` 雙重防護 |
| 不用 shell 做取代 | ✅ 全程 Edit/Write |
| `npm run verify` 必須綠 | ✅ 每個 commit 檢查 |

---

## 9. 風險

| # | 風險 | 對策 |
|---|---|---|
| R1 | 分類 chips 只支援一級，二級入口（若未來帶 `categoryId`）會被忽略 | 在 `onLoad` 明確記錄；需要二級時由分類頁負責 |
| R2 | 本機分頁與真後端分頁語意不同 | `paginateItems()` 集中規則；P7b 換後端時只改這一個函式的呼叫端 |
| R3 | 商品有 SKU 時卡片價格是「展示起價」 | 卡片加規格導向詳情；加購不從列表寫入 SKU 價 |
| R4 | 舊 `services/good/*` 仍被其他頁引用 | T5 只停止引用，不刪除；清理留給後續 |
| R5 | WXML 沒有編譯期檢查 | 改完跑一次性核對：事件處理函式存在、`t-search` 已註冊、`goods-list` 事件名稱一致 |

---

## 10. 回滾

| commit | 回滾方式 |
|---|---|
| T5-1 | `git revert`（只動 `catalogView` 與列表頁） |
| T5-2 | `git revert`（UI 層） |
| T5-3 | `git revert`（空態／邊界） |
| T5-4 | `git revert`（文件） |
