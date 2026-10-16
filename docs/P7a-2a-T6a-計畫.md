# P7a-2a / T6a 逐檔計畫 —— 商品詳情接新 API（＋加入購物車＋收藏）

> 產出日期：2026-10-17
> 分支：`refactor/hexagonal`（HEAD = `fa1e283`）
> **狀態：計畫。尚未動任何代碼。等 §9 確認。**
> 前置：`docs/01` §3.7／§4、`docs/04-前端規範.md`、`docs/P7a-2a-T3.6.1-診斷報告.md`（Bug 2/3 的根因）
> **順序變更**：T6a **提前到 T5 之前**（使用者 2026-10-17 決定）——
> T5 的商品列表點進去也是死的，體驗斷裂；T6a 是當前最緊迫的。

---

## 0. 這一頁為什麼是「重寫資料層」而不是「改幾行」

`pages/goods/details` 目前是**完整的電商詳情頁**（450 行 js／165 行 wxml／379 行 wxss
＋ 3 個自家元件）。它讀的是舊電商 mock（`model/good.js`），而那個 mock 對 `prd-*`
**查不到東西** → 這就是 Bug 2（¥0.00）與 Bug 3（無圖）的根因
（`docs/P7a-2a-T3.6.1-診斷報告.md` §1.1）。

所以 T6a 的工作是：**把資料層換成新 API，並把沒有資料來源的電商區塊拿掉**。

---

## 1. 資料怎麼讀（要求 1）

### 1.1 參數契約（正式定案）

| 參數 | 說明 |
|---|---|
| `productId` | **商品**（`products`）—— 正式契約 |
| `serviceId` | **服務**（`services`）—— T6a 新增（見 §2） |
| `spuId` | ⚠️ **過渡期相容**：T4／T3.6 目前同時帶 `productId` 與 `spuId`，兩者同值 |

頁面判斷順序：`serviceId` → 服務；否則 `productId || spuId` → 商品。
（T4／T3.6 的呼叫端在 T6a 之後**不必改**，`spuId` 相容層留到那兩處清理時一併移除。）

### 1.2 資料來源

| 型別 | API | 回傳 |
|---|---|---|
| 商品 | `fetchProductDetail(productId)` | 單一 product（**已存在**） |
| 服務 | `fetchServiceDetail(serviceId)` | `{ service, products }`（**已存在**；`products` 是 P7a-2b「加購零件」要用的，T6a 先不用） |

⚠️ **不新增 API 方法** —— 兩支都已存在且有契約測試。
（`fetchProductDetail` 目前**無人呼叫**，T6a 是它的第一個使用者。）

### 1.3 新增 `utils/detailView.js`（純函式）

**不放在 `catalogView.js`**：後者管「分類清單與卡片」，詳情頁要的是
「單一項目的詳情 ＋ 規格彈窗的 model」，兩者沒有共用邏輯，混在一起會讓
`catalogView` 變成什麼都塞的雜物袋。

```js
buildDetailView(item)        // 商品／服務 → 詳情頁的 view model（型別分支在這裡）
toSpecPopupModel(item)       // → { specList, skuList } | null（null = 無規格，不該開彈窗）
```

**`buildDetailView(item)` 回傳**（欄位名盡量沿用舊 WXML，減少不必要的改動）：

```js
{
  itemType, id,
  images: [thumb],          // 單圖（多圖詳情見 §5 Q-5）
  title, description,
  priceCents,               // 分
  isSoldOut,                // 商品：stock === 0
  isDelisted,               // isActive === false
  // ── 商品才有 ──
  stock, hasSpecs, specCount,
  // ── 服務才有 ──
  durationMinutes, skillTags,
  // ── 底部按鈕的顯示決策 ──
  canAddToCart,             // 商品 && 有庫存 && 上架
  canBuyNow: false,         // ⚠️ 商品**永遠不得有「立即下單」**（P7a2a-C2）
}
```

---

## 2. 服務 vs 商品的差異處理（要求 2）

| 面向 | 商品（`product`） | 服務（`service`） |
|---|---|---|
| 規格 | 有（`specs[]`）→ 加購要開彈窗 | **無** → 不顯示「已選」列 |
| 庫存 | 有（`stock`）→ 售完／下架要擋 | **無**（產能＝可預約時段，派單時才確認，§3.7.4） |
| 時長 | ❌ | ✅ `durationMinutes` 要顯示 |
| 技能標籤 | ❌ | ✅ `skillTags`（**fake 目前沒有這個欄位**，見 §3） |
| 加入購物車 | ✅ 有按鈕 | ❌ **永遠不進購物車**（§3.7.2） |
| 立即下單 | ❌ **不得有**（P7a2a-C2） | ✅ 語意上是「立即預約」→ **屬 P7a-2b**（依賴 T7 的結算頁） |

### 2.1 ⚠️ 與 P7a-2b 的範圍重疊（**必須先講清楚**）

`docs/SESSION-HANDOFF` §6 目前寫 P7a-2b ＝「服務詳情＋加購零件＋分類頁＋首頁調整」。
若 T6a 做了服務詳情的**顯示層**，P7a-2b 就只剩：

| 項目 | 階段 |
|---|---|
| 服務詳情的**顯示**（名稱／價格／時長／描述／技能標籤） | **T6a** |
| 服務的**預約時段選擇**＋「立即下單」 | **P7a-2b**（依賴 T7） |
| 服務詳情頁的**加購零件**區塊 | **P7a-2b** |
| 分類頁的內容、首頁兩個區塊 | P7a-2b |

→ **§9 Q-1 需要你確認**：T6a 做服務顯示層（我建議）還是維持 Toast 到 P7a-2b？
若採前者，我會一併更新 P7a-2b 的範圍描述，避免兩階段做同一件事。

### 2.2 服務在 T6a 的底部按鈕

服務沒有「加入購物車」。T6a 的處理：**右下角留空**（`buttonType: 0`，`buy-bar` 不顯示按鈕），
因為「立即預約」需要 T7 的結算頁。左下角仍是「客服／收藏」（兩者對服務一樣有意義）。

---

## 3. fake 資料需要的補充

| # | 內容 | 理由 |
|---|---|---|
| 1 | `PRODUCTS` 各加 `description` | 詳情頁有「詳情介紹」區塊要顯示文字 |
| 2 | `SERVICES` 各加 `skillTags` | §3.7.1 說服務有技能標籤；詳情頁要顯示 |
| 3 | 契約測試：每個商品／服務都有 `thumb` 與 `description` | 少一個就是破圖或空白區塊 |

⚠️ **不動 T4 的四種邊界情況**（`prd-2` stock 3／`prd-3` stock 0／`prd-4` 下架），
測試會繼續斷言。另外 `prd-3`（stock 0，上架）在詳情頁正好用來驗收「已售完」。

---

## 4. 規格選擇器（要求 3）

### 4.1 可以複用 —— 但需要「合成」它的資料形狀

`pages/goods/details/components/goods-specs-popup`（339 行，**純呈現＋選擇邏輯，零 API 依賴**）
要的形狀是：

```js
specList: [{ specId, title, specValueList: [{ specValueId, specValue, isSelected, hasStockObj }] }]
skuList:  [{ skuId, quantity, specInfo: [{ specId, specValueId }] }]
```

T6a 的資料模型只有**一層規格值**（`product.specs: [{ specId, name }]`，例如
`prd-1` ＝ 標準罐／大罐），所以 `toSpecPopupModel()` 合成：

| 產出 | 來源 |
|---|---|
| `specList[0].title` | 固定 `'規格'`（新模型沒有維度名稱） |
| `specList[0].specValueList[]` | `product.specs` → `{ specValueId: spec.specId, specValue: spec.name }` |
| `skuList[]` | 每個 spec 一個 SKU：`{ skuId: spec.specId, quantity: product.stock, specInfo: [{ specId: 'size', specValueId: spec.specId }] }` |

彈窗內部的**庫存交集演算法**（150 行，判斷「哪些規格組合有貨」）在單維度下會退化為
「每個值都跟商品總庫存相同」—— **邏輯仍然正確**，只是結果單純。
`stock === 0` 時全部標為售罄 ✓（`prd-3` 可直接驗收）。

### 4.2 ⚠️ 彈窗有兩個必須修的既有問題

| # | 問題 | 處置 |
|---|---|---|
| 1 | `<t-stepper max="{{2}}">` —— **購買數量上限被硬寫成 2** | 改為 `max="{{limitMaxCount}}"`，由頁面傳入 `min(stock, 999)` |
| 2 | 彈窗內有「**立即购买**」按鈕（簡體） | **移除**（商品不得有立即下單，P7a2a-C2），並把「加入购物车」改繁體 |

### 4.3 資料要「一起給」，不能只給一半

`specList` 與 `skuList` 各有 observer，`initData()` 會用 `skuList` 算庫存。
若只先給 `specList`，會先算成「全部售罄」再被第二次覆蓋 —— 畫面可能閃一下錯誤狀態。
**處置**：兩者都由同一次 `setData` 給（它們本來就是同一個純函式的產出），並且
**無規格商品不傳**（`specList: []` 時彈窗不初始化）。

---

## 5. 加入購物車（要求 4）

| 情況 | 行為 |
|---|---|
| 商品、**無規格** | 直接 `cart.addItem()` → Toast「已加入購物車」 |
| 商品、**有規格** | 開規格彈窗 → 選完 → 「加入購物車」→ 帶**選中的 specId** 寫入 → Toast |
| 商品、售完／下架 | 按鈕 disabled（`buy-bar` 的 `isStock`） |
| **服務** | 不顯示加入購物車（§3.7.2） |

⚠️ **選中的 specId 來源**：彈窗的 `selectedSku` 是 `{ specId: specValueId }`，
在單維度下就是選中的 `specValueId`（＝ 我的 `spec.specId`）。
→ 加入購物車時 `specId` 用**彈窗回傳的 `selectedSku` 值**，不用自己重算。

`utils/cart.js` 的 `addItem` 會擋下重複提交與超上限，頁面只負責顯示結果
（`LIMIT_EXCEEDED` → 「購物車已滿（上限 50 項）」）。

---

## 6. 收藏（要求 5）

### 6.1 新增 `utils/favorite.js`（純函式 ＋ 本機 Storage）

與 `utils/cart.js` **同一套策略**（`docs/P7a-2a-計畫.md` §13.4）：
schema 對齊後端、P7b 只換讀寫來源。

```js
STORAGE_KEY = 'repair.favorites.v1'
LOCAL_CUSTOMER_ID = '__local__'      // ⚠️ P7a 佔位符，P5 必須改為後端以 OPENID 判定

createStore()                         // { items: [], updatedAt: null }
isFavorite(store, productId)
toggleFavorite(store, { productId, snapshot, now })
addFavorite / removeFavorite / listFavorites
normalizeStore(raw)                   // 與 cart 同一套容錯（單筆壞掉不毀整份）
loadFavorites() / saveFavorites(store)
```

**存進去的形狀**（對應 `docs/01` §7.2 第 9 點）：

```js
{
  customerId: LOCAL_CUSTOMER_ID,
  productId,
  productSnapshot: { name, image, priceCents },   // ← 快照（Q-4 決議）
  createdAt,
}
```

> ⚠️ **命名風格**：本機 Storage 用 camelCase（前端慣例），後端是 snake_case
> （`product_snapshot.price_cents`）—— 由 P7b 的 adapter 轉換。
> 這與購物車的作法一致（`utils/cart.js` 也是 camelCase）。

### 6.2 T6a 只做「按鈕 + 寫入」

| 做 | 不做（T6b） |
|---|---|
| 詳情頁的收藏按鈕（圖示切換 ＋ 文字「收藏／已收藏」） | 「我的收藏」清單頁 |
| 寫入／移除本機 Storage | 舊價提示「¥80（已漲至 ¥100）」的列表顯示 |
| 重進頁面仍顯示已收藏 | 取消收藏的清單操作 |

---

## 7. 左下角按鈕改造（要求 6、7）

### 7.1 現況

`pages/goods/details/index.js` 的 `jumpArray`：
`[{title:'首页', url:'/pages/home/home', iconName:'home'}, {title:'购物车', url:'/pages/cart/index', iconName:'cart', showCartNum:true}]`

`buy-bar` 的 `toNav` 用 **`wx.switchTab({url})`** 導頁。

### 7.2 ⚠️ 這裡有一個契約問題

**「客服」與「收藏」都不是 tabBar 頁面** → 不能走 `switchTab`。
所以 `buy-bar` 的 `jumpArray` 項目要從「**url**」改成「**action key**」：

```js
jumpArray: [
  { key: 'cs',       title: '客服', iconName: 'service' },
  { key: 'favorite', title: '收藏', iconName: 'star' },
]
```

`buy-bar` 的 `toNav` 改為 `triggerEvent('toNav', { key })`，頁面依 `key` 分流：

| key | T6a 行為 | 之後 |
|---|---|---|
| `cs` | **佔位**：Toast「客服詢問將於下一階段提供」 | **T6b** 開詢問彈窗 |
| `favorite` | 切換收藏（§6） | — |
| `home` / `cart` | 保留支援（`switchTab`），供其他頁面日後複用 | — |

> 圖示：`wr-service`（客服）、`wr-star`（收藏）—— 已確認在
> `style/iconfont.wxss` 內。`showCartNum` 的購物車角標在 T6a 不再需要（購物車已不在左下角）。

### 7.3 右下角

| 型別 | 右下角 |
|---|---|
| 商品 | **只保留「加入購物車」** —— **移除「立即购买」**（P7a2a-C2） |
| 服務 | 留空（立即預約屬 P7a-2b） |

---

## 8. Commit 切分（要求 8）

| # | commit | 內容 | 這一步之後的狀態 |
|---|---|---|---|
| **T6a-1** | `utils/detailView.js` ＋ 測試 | 純新增，無人引用 | ✅ 安全點 |
| **T6a-2** | `utils/favorite.js` ＋ 測試 | 純新增，無人引用 | ✅ 安全點 |
| **T6a-3** | fake 資料補 `description`／`skillTags` ＋ 契約測試 | 只加欄位，不動既有值 | ✅ 安全點 |
| **T6a-4** | `buy-bar` ＋ `goods-specs-popup` 的**文案與 stepper 修正**（**不改契約**） | 舊詳情頁仍可運作（少一顆按鈕、數量上限變正確） | ✅ 安全點 |
| **T6a-5** | **`buy-bar` 契約（url → action key）＋ `pages/goods/details` 切換** | ⚠️ **兩者必須同一個 commit**（元件與它唯一的使用者） | ✅ 安全點 |
| **T6a-6** | 文件（`P7a-2a-計畫.md` §13、handoff、診斷報告的狀態更新） | — | ✅ |

> **T4 的教訓**：元件改了契約而頁面沒跟上 → 「按了沒反應」的中間 commit。
> T6a-5 刻意把兩者綁在一起；T6a-4 則刻意只改**不涉及契約**的部分（文案、stepper 上限）。

**回滾**：tag `pre-p7a2a-t6a`；`git reset --hard pre-p7a2a-t6a` 可放棄整個 T6a。
T6a-1～T6a-3 也可逐個 `git revert`（純新增）。

---

## 9. 驗收標準（要求 9）

### 9.1 自動化

| # | 驗收項 | 預期 |
|---|---|---|
| A1 | `npm run verify` | 全綠 |
| A2 | `detailView` 測試：商品／服務的分支、無規格不產 specList、`stock 0` → 售完、下架 → isDelisted、`canBuyNow` 恆為 false | 通過 |
| A3 | `detailView` 測試：`toSpecPopupModel` 的形狀（`specList[0].title`／`specValueList`／`skuList.quantity = stock`）| 通過 |
| A4 | `favorite` 測試：切換、重複收藏不重複、快照寫入、`normalizeStore` 容錯 | 通過 |
| A5 | 契約測試：每個商品／服務都有 `thumb`＋`description` | 通過 |
| A6 | **既有 1002 測試不受影響** | 一個都不紅 |
| A7 | WXML 靜態核對（一次性腳本）：事件處理函式／元件註冊／事件名一致 | 通過 |
| A8 | 未動 `packages/`、`cloudfunctions/` | `git diff --stat` 為空 |

### 9.2 人工驗收（開發者工具）

| # | 驗收項 | 預期 |
|---|---|---|
| C1 | 分類頁 → 點**商品**（如「排水管接頭」）→ 詳情頁顯示**正確的圖與價** | 不再 ¥0.00、不再空圖 |
| C2 | 商品詳情**沒有**「立即購買」 | 目視 |
| C3 | 左下角是「**客服**」與「**收藏**」（不是首頁／購物車） | 目視 |
| C4 | 無規格商品（`prd-2`）按「加入購物車」→ 直接加入 + Toast | 操作 |
| C5 | 有規格商品（`prd-1`，標準罐／大罐）→ 開彈窗 → 選規格 → 加入 → **購物車顯示該規格名** | 操作 |
| C6 | 規格彈窗的**數量上限＝庫存**（`prd-1` 是 20，不是 2） | 操作 |
| C7 | `prd-3`（庫存 0）→「加入購物車」停用；開彈窗選規格 → 顯示售罄 | 操作 |
| C8 | `prd-4`（已下架）→ 從詳情頁直接開（改 URL）→ 顯示「商品已下架」，按鈕停用 | 改 URL 操作 |
| C9 | 點「收藏」→ 文字變「已收藏」→ **離開再進詳情頁仍是已收藏** | 操作 |
| C10 | 點「客服」→ 佔位提示（T6b 才實作） | 目視 |
| C11 | 服務詳情（若 Q-1 採「T6a 做顯示層」）：顯示時長與描述、**沒有加入購物車** | 操作 |
| C12 | 畫面無電商殘留（評價／領劵／優惠券／分享以外的電商元素） | 目視 |

### 9.3 負向測試

| # | 故意違反 | 預期 |
|---|---|---|
| N1 | 商品詳情出現「立即下單」 | **C2 人工驗收**（靜態規則難以表達） |
| N2 | 服務被加入購物車 | `cart.addItem` 拒絕（既有測試） ＋ `canAddToCart` 為 false |
| N3 | 只給 `specList` 不給 `skuList` | §4.3 的說明 ＋ A3 測試（兩者一起產出） |

---

## 10. 風險

| # | 風險 | 說明與對策 |
|---|---|---|
| **R1** | **9 個入口會進詳情頁，其中 4 個帶舊 id** | `pages/home/home.js`（P7a-2b 改）、`pages/goods/list`（T5 改）、`pages/goods/result`（搜尋，未排程）、`pages/order/order-detail`（舊訂單 mock）、`pages/order/after-service-detail`（帶 `skuId`）。**這些入口在 T6a 之後會顯示「找不到這件商品」**（比現在的 ¥0.00 空白頁好，但仍不是完整體驗）。→ §11 Q-2 |
| **R2** | 規格彈窗的 stepper 上限硬寫 2 | §4.2 修掉 |
| **R3** | `specList`／`skuList` 分開給會閃錯誤狀態 | §4.3：同一次 `setData` |
| **R4** | 移除「評價／領劵／優惠券」區塊 = 移除既有（假）功能 | A7 已定優惠券／活動下線；評價沒有新資料源 → §11 Q-3 |
| **R5** | wxss 379 行中部分對應已移除的區塊 | 只刪「確定無對應節點」的規則，並逐條列出（T4 的作法） |
| **R6** | 服務詳情與 P7a-2b 範圍重疊 | §2.1，並更新 P7a-2b 的描述 |
| **R7** | 收藏的 `__local__` 佔位符 | 已在 `docs/01` §7.2 與 `P7a-2a-計畫.md` §13.4 標明「**P5 必須改**」 |

---

## 11. 待你確認（✅ 已於 2026-10-17 全部同意）

| # | 問題 | 決議 |
|---|---|---|
| **Q-1** | 服務詳情的顯示層在 T6a 做 | ✅ **同意**，服務與商品共用同一個詳情頁骨架 |
| **Q-2** | 舊 id 入口暫時顯示「找不到這件商品」 | ✅ **接受**（比 ¥0.00 空白頁好）。各入口的修復階段見 §11.1 |
| **Q-3** | 移除「商品評價」區塊 | ✅ 同意 |
| **Q-4** | 保留「分享」 | ✅ 同意 |
| **Q-5** | 「詳情介紹」改文字 | ✅ 同意；**多圖詳情列為 P2 的新欄位** |
| **Q-6** | 規格彈窗的數量上限改為庫存 | ✅ 同意 |
| **Q-7** | 收藏按鈕：圖示 ＋ 文字 | ✅ 同意 |

使用者並確認四件事：buy-bar 契約與詳情頁同一 commit、規格彈窗修 `max="{{2}}"` 與移除「立即購買」、9 個入口暫時斷裂、T6a 做顯示層。

### 11.1 舊 id 入口的修復階段（Q-2 的附帶記錄）

| 入口 | 修復階段 |
|---|---|
| `pages/goods/list` | **T5** |
| `pages/home/home` | **P7a-2b** |
| `pages/goods/result`（搜尋） | **未排程**（非核心） |
| `pages/order/order-detail`、`pages/order/after-service-detail` | **P2 之後**接新訂單 |
| `pages/coupon/**`、`pages/promotion/**` | 已下線（A7），不處理 |

### 11.2 P7a-2b 的範圍更新（Q-1 的附帶結果）

> **P7a-2b ＝ 服務預約時段選擇 ＋ 服務立即下單 ＋ 加購零件
> （服務／商品的詳情頁顯示層已於 T6a 完成）**
> ＋ 分類頁內容、首頁兩個區塊調整。

---

## 12. 執行結果（2026-10-17）

| # | commit | 內容 | 測試數 |
|---|---|---|---|
| T6a-1 | `4939572` | `utils/detailView.js` ＋ 30 項測試 | 1002 → 1032 |
| T6a-2 | `b9aa0df` | `utils/favorite.js` ＋ 30 項測試 | 1032 → 1062 |
| T6a-3 | `f73d544` | fake 補 `description`／`skillTags` ＋ 契約測試 | 1062 → 1065 |
| T6a-4 | `09b4793` | `buy-bar`／`goods-specs-popup` 的文案與 stepper 修正 | 1065 |
| T6a-5 | `8cc2a88` | `buy-bar` 契約 ＋ 詳情頁切換（**同一 commit**） | 1065 |
| T6a-6 | 本 commit | 文件 | 1065 |

**tag**：`pre-p7a2a-t6a`。**`npm run verify` 全程全綠。**

### 12.1 與計畫的差異

| # | 計畫 | 實際 | 原因 |
|---|---|---|---|
| 1 | T6a-1 的測試含「真實 fake 資料對齊」的 description／skillTags 斷言 | 那兩條**延到 T6a-3** | T6a-1 當時 fake 還沒有這兩個欄位，先寫會是紅的（已在該檔註解標明） |
| 2 | — | **`favorite.test.js` 抓到一個真實 bug** | `listFavorites()` 原本只做淺拷貝，`productSnapshot` 仍是同一個物件參考 → 呼叫端會改到內部資料。已修並在函式註解記錄 |
| 3 | — | 詳情頁 wxss 的舊樣式**刻意先不刪** | 379 行、無畫面可對照，誤刪風險大於收益 → 留待 T5 或 P7a-2b 清理（檔頭已註明） |
| 4 | — | **收藏只給商品**（服務不顯示收藏入口） | `favorites` 集合的鍵是 `product_id`（`docs/01` §7.2 第 9 點）；服務的收藏是 **P2 的 schema 問題**，不在 T6a 擅自決定 |
| 5 | — | 額外：`index.wxml` 移除失效的 `navigation` 綁定 | 新的 data 不再有 `navigation` 欄位（舊版傳給 t-swiper） |

### 12.2 已知未完成（**不是 T6a 的範圍**）

| 項目 | 歸屬 |
|---|---|
| 詳情頁的舊樣式清理（見差異 3） | T5 或 P7a-2b |
| 「客服」按鈕的實際行為（詢問彈窗 ＋ 寫入） | **T6b** |
| 服務的「立即預約」與「加購零件」 | **P7a-2b** |
| 服務的收藏（需要 P2 定 schema） | P2 之後 |
| 多圖詳情（詳情介紹的圖片） | P2 的新欄位 |
