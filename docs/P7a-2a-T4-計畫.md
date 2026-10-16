# P7a-2a / T4 細部計畫 —— 購物車頁改造（待確認）

> 產出日期：2026-10-16
> 分支：`refactor/hexagonal`（HEAD = `f4f91d6`）
> 前置文件：`docs/01-目標架構.md` **§3.7**（尤其 §3.7.2 / §3.7.6）、`docs/04-前端規範.md`、`docs/P7a-2a-計畫.md` §5
> **範圍：只做 T4 —— `pages/cart/**` 與它需要的資料。T5／T6／T7 不在本檔。**

---

> ## ✅ 執行結果（2026-10-16 追加）
>
> **T4 已完成**：`22ba148`（T4-1 純函式）+ `66a4c9d`（T4-2 fake 資料）+ `9b0be5e`（T4-3/4/5 切換）。
> 測試 918 → **966**，`npm run verify` 全綠。**T3.5**（tabBar 改名）另於 `08167a0` 完成。
>
> **與本計畫的差異**：
> 1. §9 的 commit 切分**合併為一個**（`9b0be5e`）—— 元件／頁面／文案是同一個原子單位，
>    拆開會有兩個 commit 是壞的（詳見該 commit 訊息）。
> 2. 動到的檔案比 §5 清單多：`cart-bar`（2 檔）、`goods-card`／`specs-popup`（各 1 檔 wxml）。
> 3. §5.3 O1（`normalizeCart`）、O2（刪 `index.wxs`）**都做了**。
> 4. §6 的元件去留、§7 的結算流程、§8 的事件介面**照計畫實作**。
>
> **§13 的七問已回覆**：Q-1 照原順序；Q-2 寫橋接 + TODO；Q-3 保留
> `fetchProductCatalogIndex`；Q-4 標 `@deprecated`；Q-5 兩項都做；Q-6 可接受；Q-7 回寫文件。
>
> ⏸ **人工驗收 C1–C13 尚未執行**（需在開發者工具操作，見 §11.3）。

---

## 0. 動手前必須先知道的三件事

### F1 ⚠️ 新的購物車**沒有任何「加入」入口** → T4 無法端到端人工驗收

| 事實 | 依據 |
|---|---|
| 商品詳情頁的「加入購物車」目前**只彈一個 Toast**，不寫任何資料 | `pages/goods/details/index.js:218` `addCart()` 只呼叫 `Toast` |
| 舊的加購流程走的是電商 mock（`model/cart.js` 的多店購物車），**不是** `utils/cart.js` | `pages/cart/index.js` 現行資料來源是 `services/cart/cart` |
| 「只保留加入購物車」是 **T6** 的工作 | `docs/P7a-2a-計畫.md` §3 M5 |

**結論**：T4 的購物車是「消費者」，而「生產者」在 T6。
因此 T4 的人工驗收**必須先用 Storage 種子資料**（§11.3 提供可貼的片段），
或者**把順序改成 T6 先做**（見 §13 Q-1）。

### F2 ⚠️ `cart-group` 與 `pages/cart/index` 是**同一個原子單位**

`cart-group` 的對外介面（properties 與事件）**只有 `pages/cart/index` 一個使用者**
（已用 `grep` 確認全專案無其他引用）。

一旦改了 `cart-group` 的 properties，舊的 `index.js` 立刻收不到資料 —— 反之亦然。
**兩者必須在同一個 commit 內一起切換**，中間沒有「都還能跑」的狀態。
這決定了 §9 的 commit 切分方式。

### F3 T2 已偏離原計畫：**fake API 沒有購物車方法**

`docs/P7a-2a-計畫.md` §5.1 原本要在 `services/api/` 加
`fetchCart` / `addToCart` / `updateCartQuantity` / `removeCartLine` / `checkoutCart`。

T2 的 commit（`f467175`）**明確記錄了偏離並說明理由**：

> 購物車在 P7a-2a 是**本機狀態**（頁面直接用 `utils/cart.js`），fake API 只提供商品資料

**這偏離是對的**（避免 ESM／CJS 混用，也符合 §3.7.8 Q-D 的 Storage 決策）。
本計畫**沿用 T2 的偏離**，因此 T4 的資料來源是：

```
utils/cart.js（本機購物車，CJS）
        +
services/api/index.js 的 fetchProducts()（商品現況）
        ↓
utils/cartView.js（純函式：合併兩者，產生畫面用的 view model）
        ↓
pages/cart/index.js（頁面：只管事件與 Storage 寫入）
```

---

## 1. 授權範圍與回滾單位

| 項目 | 狀態 |
|---|---|
| 動 `pages/cart/**`、`utils/`、`tests/`、`services/api/_fake/data.js` | ✅ 已授權（P7a 範圍） |
| 動其他 `pages/`（`goods/`、`order/`） | ❌ **不在 T4**（那是 T5/T6/T7） |
| 動 `packages/`、`cloudfunctions/` | ❌ 完全不碰 |
| 動資料庫 | ❌ |

**回滾單位＝整個 T4**（tag `pre-p7a2a-t4`）。內部的多個 commit 是**為了讓你分段閱讀 diff**，不是為了分段回滾（理由見 §9）。

---

## 2. 目標畫面規格

### 2.1 有商品時

```
┌──────────────────────────────────────────┐
│ ☑  [圖] 冷媒 R410                          │
│        標準罐                     − 2 +   │
│        ¥25.00                             │
├──────────────────────────────────────────┤
│ ☑  [圖] 排水管接頭                          │
│                                   − 1 +   │
│        ¥8.00                              │
├──────────────────────────────────────────┤
│ 失效商品                      清除失效商品   │
│ ▨  [圖] 濾網（通用型）  已售完              │
│        加入時 ¥4.50                       │
└──────────────────────────────────────────┘
┌──────────────────────────────────────────┐
│ ☑ 全選        合計 ¥33.00     去結算(2)     │
└──────────────────────────────────────────┘
```

| 元素 | 規格 |
|---|---|
| 勾選框 | 每列左側；**失效商品沒有勾選框**（改為灰色圓點，沿用既有 `.unCheck-icon`） |
| 縮圖 | `goods-card` 的 `thumb-cover` slot；失效時蓋一層「已售完／已下架」遮罩 |
| 價格 | **加入時的價格**（`addedPriceCents`，§3.7.6 第 3 點） |
| 規格 | 有 `specId` 才顯示規格名，可點開 `specs-popup` 查看 |
| 數量 | `t-stepper`，`max` = 庫存（`stock`），上限 999 |
| 刪除 | 右滑露出「刪除」（沿用 `swipeout`） |
| 小計 | 只算**已勾選**的項目，用**加入時價格** |
| 結算按鈕的數字 | `去結算(N)` 的 N ＝**已勾選的件數合計**（Σ quantity），不是明細筆數。與現行 `cart-bar` 的 `totalGoodsNum` 語意一致 |
| 空車 | `cart-empty`，文案「購物車是空的」＋按鈕「去逛逛零件」 |

### 2.2 三種「非正常」狀態的顯示

| 狀態 | 顯示位置 | 可否勾選 | 可否結算 |
|---|---|---|---|
| **庫存不足**（`OUT_OF_STOCK`） | **失效區**，紅字「已售完」 | ❌ | ❌ |
| **已下架**（`DELISTED`） | **失效區**，灰字「已下架」 | ❌ | ❌ |
| **商品不存在**（`PRODUCT_NOT_FOUND`） | **失效區**，灰字「商品已不存在」 | ❌ | ❌ |
| **價格已變動**（`PRICE_CHANGED`） | **留在正常區**，黃字小標「價格已變動」＋次要文字顯示現價 | ✅ | ✅（結算時提示） |

> 前三個是 `utils/cartCodes.js` 的 `BLOCKING_CODES`，第四個不是 ——
> **這條界線已經在 T1 定好，T4 只是沿用，不重新定義。**

---

## 3. 新增檔案：`utils/cartView.js`（純函式）

**為什麼要有這一層**：把「購物車 × 商品現況 → 畫面」的組合邏輯從頁面抽出來，
它才能在 `npm test` 裡被驗證（**頁面與元件在 CI 中無法被執行**）。
這與 T1 把購物車邏輯抽成 `utils/cart.js` 是同一個理由。

### 3.1 匯出

```js
buildCartView({ cart, catalog, selectedLineIds })
  → { lines, invalidLines, totalCents, selectedCount, allSelected,
      hasPriceChange, priceChangeLines }

reconcileSelection(prevSelectedLineIds, lines, { firstLoad })
  → string[]        // 新一輪該勾選的 lineId

toCheckoutGoods(lines)          // 給 T7 的新格式（＝ utils/cart.toCheckoutPayload 的 items）
toLegacyGoodsRequest(lines)     // §7 的相容橋接（若 Q-2 採納）
```

`catalog` 的形狀：`{ [productId]: product }`，**直接由 `fetchProducts()` 的列表建索引**（含 `name`／`thumb`／`stock`／`priceCents`／`isActive`／`specs`）。

> ⚠️ **注意**：T2 另外做了 `fetchProductCatalogIndex()`（只含 `isActive/stock/priceCents`，**不含名稱與圖片**）。
> T4 改用 `fetchProducts()` 自己建索引，因為畫面需要名稱與圖片，兩者不必分兩次打。
> `fetchProductCatalogIndex()` 因此變成**目前無人呼叫**（見 §13 Q-3）。

### 3.2 view model 的形狀（單一形狀，直接用於 WXML）

```js
{
  // 識別（跨頁與後端一致）
  lineId, productId, specId,

  // 呈現（欄位名刻意配合既有 goods-card 的期待）
  title, thumb, desc,
  price,            // = 加入時價格（分）；goods-card 的 price 元件吃這個
  quantity,
  specs,            // string[]（goods-card 用 {{ goods.specs }} 直接渲染）
  stockQuantity,    // = 商品現況庫存；goods-card 的內建「庫存不足」提示靠它
  hideKey,          // 明確關掉 originPrice / num 等電商欄位

  // 語意（頁面判斷用）
  priceCents, addedPriceCents, currentPriceCents,
  maxQuantity, isSelected, isInvalid,
  issueCode, issueText, isPriceChanged,
}
```

> **為什麼要配合 `goods-card` 的欄位名**：見 §6 的決策 —— 保留該元件、不改其結構。
> 這個映射是刻意的「適配」，寫在 `cartView.js` 並加註解說明，而不是散在 WXML 裡。

### 3.3 `ISSUE_TEXT`（問題碼 → 顯示文字）

| 問題碼 | 文字 |
|---|---|
| `OUT_OF_STOCK` | 已售完 |
| `DELISTED` | 已下架 |
| `PRODUCT_NOT_FOUND` | 商品已不存在 |
| `PRICE_CHANGED` | 價格已變動 |

**放在 `cartView.js`（呈現層），不放 `cartCodes.js`** ——
後者的用途是「與後端保持一致的語意碼」，不該混入中文文案。

---

## 4. 頁面設計（`pages/cart/index.js`）

### 4.1 狀態

```js
data: {
  ready: false,
  isEmpty: true,
  lines: [],            // 正常商品
  invalidLines: [],     // 失效商品
  selectedLineIds: [],
  totalCents: 0,
  selectedCount: 0,
  allSelected: false,
  hasPriceChange: false,
  settling: false,      // 防止連點結算
}
```

### 4.2 流程

| 時機 | 動作 |
|---|---|
| `onLoad` | `this.getTabBar().init()`（**保留**，這是 tabBar 頁面） |
| `onShow` | `getTabBar().init()` → `refresh()`（**每次都重讀 Storage**：從商品詳情加購後回來要看得到） |
| `refresh()` | ① `loadCart()` ② 空車 → 直接顯示空車態、**不打 API** ③ 非空 → `fetchProducts()` 建索引 ④ `buildCartView()` ⑤ `reconcileSelection()` ⑥ `setData` |
| 數量變更 | `updateQuantity()` → `saveCart()` → 只重算 view（**不重打 API**，用快取索引） |
| 刪除 | `Dialog.confirm` → `removeLine()` → `saveCart()` → 重算 |
| 清除失效 | 逐筆 `removeLine()` → `saveCart()` → 重算 |
| 點商品 | `wx.navigateTo` 到商品詳情（**參數名見 §12 R5**） |
| 空車按鈕 | `wx.navigateTo({ url: '/pages/goods/list/index' })` |

**失敗處理**：`fetchProducts()` 失敗 → `Toast` 提示並**保留上一次已渲染的畫面**，
絕不因為取不到商品資料就把購物車清空（那會讓使用者以為商品被刪了）。

### 4.3 勾選狀態的語意（重要）

| 規則 | 理由 |
|---|---|
| 勾選狀態**只存在頁面記憶體**，不寫進 Storage | 它是「這次結算要買什麼」的臨時決定，不是購物車的內容。`utils/cart.js` 的 schema 要對齊後端，**後端不會存 isSelected** |
| 首次進入 → **全部勾選** | 與 TDesign 原行為一致；多數情況使用者就是要全買 |
| 之後每次 refresh → 保留「仍存在且仍有效」的 lineId | 只改數量不該讓勾選跳掉 |
| **新出現的項目預設勾選** | 否則「加入商品 → 回購物車 → 按結算」會發現新商品沒被算進去 |
| 失效項一律不勾選、也不在 `selectedLineIds` 內 | 避免「勾了卻不能結算」的矛盾狀態 |

實作在 `reconcileSelection()`，**有測試覆蓋**（§11.1）。

---

## 5. 逐檔計畫

### 5.1 修改（既有檔案）

| # | 檔案 | 改動 | 風險 |
|---|---|---|---|
| **M3a** | `pages/cart/index.js` | **整頁重寫**（294 → 約 210 行）：改接 `utils/cart.js` + `utils/cartView.js` + `services/api`；移除 `findGoods`／store 相關／`goCollect` | **高** |
| **M3b** | `pages/cart/index.wxml` | 改寫（31 行）：`bindselectgoods` → 新事件名；空車文案 | 中 |
| **M3c** | `pages/cart/index.json` | 標題「购物车」→「購物車」 | 低 |
| **M3d** | `pages/cart/components/cart-group/index.js` | **重寫**（162 → 約 110 行）：移除 store 分組／促銷／`gotoBuyMore`／`gotoCoupons`；`specs` 改由 view model 提供 | **高** |
| **M3e** | `pages/cart/components/cart-group/index.wxml` | **重寫**（153 → 約 80 行）：扁平列表＋失效區 | **高** |
| **M3f** | `pages/cart/components/cart-group/index.wxss` | 刪除已無對應 WXML 的規則（見下） | 中 |
| **M3g** | `pages/cart/components/cart-group/index.json` | 不需改（`specs-popup`／`goods-card`／`swipeout` 都還在用） | — |
| **M3h** | `pages/cart/components/cart-bar/index.js` + `.wxml` | ①移除 `totalDiscountAmount`（含 WXML 的「已优惠」區塊）②`handleSelectAll` **不再自己翻轉狀態**，只發事件（狀態一律由頁面持有，避免兩份真相）③文案改繁體：全選／合計／去結算 | 低 |
| **M3i** | `pages/cart/components/goods-card/index.wxml` | **只改文案**：「库存不足」→「庫存不足」、「请重新选择商品规格」→「此商品已無法購買」 | 低 |
| **M3j** | `pages/cart/components/cart-empty/index.js` | **不動**（文案由頁面明確傳入，見 §6） | — |
| **M7** | `services/api/_fake/data.js` | `PRODUCTS` 各筆加 `thumb`（顯示用；目前 4 筆都沒有圖片） | 低 |

**M3f 要刪的規則**（對應 §6 移除的區塊，逐一核對過）：

| 行 | 選擇器 | 為什麼沒有用了 |
|---|---|---|
| 13–60 | `.cart-store`、`.cart-store__check`、`.cart-store__content`、`.store-title`、`.store-name`、`.get-coupon` | 門店列與優惠券入口已移除 |
| 62–113 | `.promotion-wrap` 系列、`.promotion-line-wrap`、`.promotion-line` | 促銷活動已移除 |
| 163–178 | `.shortage-line`、`.shortage-goods-wrap`、`.shortage-tip-title` | 缺貨分組改由「失效區」呈現 |
| 229–239 | `.action-btn`、`.action-btn--active` | 只被「去凑单」按鈕使用 |

**保留**：`.goods-item-info`、`.check-wrap`、`.unCheck-icon`（失效項用）、
`.stock-mask`、`.goods-stepper`、`.stepper-tip`、`.swiper-right-del`、
`.invalid-goods-wrap` 系列（186–228，**原本就為失效商品寫好但舊 WXML 沒用到，正好接手**）。

### 5.2 新增

| # | 檔案 | 職責 |
|---|---|---|
| **N1** | `utils/cartView.js` | §3 的純函式 |
| **N2** | `tests/unit/frontend/cartView.test.js` | §11.1 的測試 |
| **N3** | `docs/P7a-2a-T4-計畫.md` | 本文件 |

> 原計畫的 `N4 tests/unit/frontend/cartApi.test.js` **作廢** ——
> 依 F3，沒有購物車 API 可測；T2 已用 `apiContract.test.js` 取代那個缺口。

### 5.3 建議一併處理（小，可選）

| # | 檔案 | 改動 | 理由 |
|---|---|---|---|
| **O1** | `utils/cart.js` | 把 `loadCart()` 內的解析抽成純函式 `normalizeCart(raw)`，並加 4 項測試 | Storage 內容可能損毀或被舊版寫壞；**目前這段完全沒有測試**，而它是唯一會接觸外部狀態的邊界 |
| **O2** | `pages/cart/components/cart-group/index.wxs` | **刪除**（`hasPromotion` 只服務促銷） | 死代碼 |

---

## 6. 頁內元件去留決策

| 元件 | 決策 | 理由 |
|---|---|---|
| `cart-group` | **重寫**（保留檔名與 `swipeout` 架構） | store 分組是電商多店概念，維修場景只有一個平台 |
| `cart-bar` | **保留，微調** | 勾選／合計／結算的功能不變，只是文案與「已優惠」欄位要移除 |
| `cart-empty` | **保留，不改** | 純呈現元件；文案由頁面傳入，元件本身保持中性 |
| `goods-card`（cart 版） | **保留，只改兩個文案** | 見下方 |
| `specs-popup` | **保留** | 顯示已選規格，與新流程無衝突（14 行 WXML） |
| `swipeout`（全域元件） | **保留** | 滑動刪除 |

### 6.1 為什麼保留 `goods-card`（而不是重寫一個購物車列）

`pages/cart/components/goods-card` 是**純呈現元件、零業務邏輯**，
且 `cart-group/index.wxss` 的排版（335 行）**是繞著它的 DOM 結構調出來的**。

重寫一個新元件 = 連帶重寫那 335 行樣式，**風險大於收益**（而我看不到畫面，只能靠你在開發者工具目視）。
因此 T4 採取「**餵它正確的資料**」而不是「換掉它」——
代價是 view model 要帶幾個它的欄位名，這個代價已經集中在 `cartView.js` 一處並加註解說明。

**但它的兩個文案是簡體，且會出現在購物車頁**，所以一併改繁體（M3i）。

---

## 7. 結算流程 —— §3.7.6 四種邊界情況的落點

`onToSettle()` 的順序**刻意如此**（每一步失敗都停在原地，不跳頁）：

```
① 沒有勾選任何商品        → Toast「請先選擇要結算的商品」，停
② 以最新 catalog 重新校驗  → 見下表 ③④⑤
③ 失效項（下架／不存在）   → 自動從購物車移除 + Toast「已自動移除 N 件失效商品」→ 重新整理
④ 勾選項含庫存不足        → Toast「部分商品庫存不足，請先移除」，停
⑤ 勾選項含價格變動        → Dialog 列出「加入時 ¥A → 現價 ¥B」→ 取消則停
⑥ 通過 → 寫入 payload → navigateTo 結算頁
```

| §3.7.6 | 文件要求 | 落點 |
|---|---|---|
| 第 1 點 | 商品被搶光 → **結算時**校驗，標紅且不可結算 | ②④；顯示在失效區（§2.2） |
| 第 2 點 | 商品下架 → **結算時自動移除並提示** | ③（**照文件做「自動移除」**，不是只擋下） |
| 第 3 點 | 購物車顯示加入時價格；結算時提示「價格已變動」 | §2.2 顯示 + ⑤ |
| 第 4 點 | 上限 50 項 | T1 的 `addItem` 已實作並有測試；**T4 不重複實作** |

### 7.1 價格變動後「按繼續」用哪個價？

**用當前價結算**，理由：

1. 真實後端一定用「下單當下的售價」，不可能用購物車裡的舊價；
2. payload 仍帶 `expectedPriceCents`（加入時價格）——**讓後端能偵測差異並回報**（這個欄位 T1 已經做好）；
3. 因此 Dialog 的文字必須**明說**「將以新價 ¥B 結算」，否則使用者會以為照舊價買。

### 7.2 寫入結算頁的資料（兩個 key）

| key | 內容 | 用途 |
|---|---|---|
| `repair.checkout.v1` | `utils/cart.toCheckoutPayload()` 的結果 | **新格式**，T7 的結算頁要用 |
| `order.goodsRequestList` | §7.3 的舊格式 | **相容橋接**，讓現行結算頁在 T7 完成前仍可運作 |

### 7.3 ⚠️ 為什麼需要舊格式橋接（Q-2）

現行 `pages/order/order-confirm/index.js:85` 是這樣讀的：

```js
const goodsRequestListJson = wx.getStorageSync('order.goodsRequestList');
goodsRequestList = JSON.parse(goodsRequestListJson);
```

**若 T4 只寫新 key，這裡會 `JSON.parse(undefined)` 直接拋錯 → 結算頁白屏。**
那不是「暫時不好用」，是**壞掉**。

橋接的內容（對應 `model/order/orderConfirm.js:3-36` 讀的欄位）：

| 舊欄位 | 值 |
|---|---|
| `storeId` | 固定 `'1000'`（維修場景只有一個平台；舊頁用 storeId 分組） |
| `storeName` | `'維修服務平台'` |
| `spuId` | `line.productId` |
| `skuId` | `line.specId \|\| 'default'` |
| `title` | `line.title` |
| `primaryImage` | `line.thumb` |
| `quantity` | `line.quantity` |
| `price` | `String(line.priceCents)`（舊 mock 用「分」的字串） |
| `specInfo` | `[{ specValue: line.specText }]` 或 `[]` |

**代價與處置**：這是十幾行過渡代碼。我會在檔案內用 `// TODO(T7): 移除相容橋接` 明確標記，
並在 §14 把「刪除橋接」列為 **T7 的必辦事項**（不能只留在這裡的口頭約定）。

---

## 8. 事件介面（`cart-group` ↔ 頁面）

| 事件 | payload | 對應頁面方法 |
|---|---|---|
| `bindselect` | `{ lineId, isSelected }` | `onLineSelect` |
| `bindselectall` | `{ isSelected }` | `onSelectAll`（由 `cart-bar` 觸發亦可，見下） |
| `bindquantitychange` | `{ lineId, quantity }` | `onQuantityChange` |
| `binddelete` | `{ lineId }` | `onLineDelete` |
| `bindgoodsclick` | `{ lineId, productId, specId }` | `onLineTap` |
| `bindclearinvalid` | — | `onClearInvalid` |
| `bindgocollect` | — | `onGotoShop`（失效區的「去逛逛零件」） |

> **綁定風格沿用現行檔案的寫法**（`bindselect="..."`，不改成 `bind:select`），
> 避免同一份 WXML 出現兩種風格。
> **「全選」維持由 `cart-bar` 發出**（`bindhandleSelectAll`），因為它畫在結算列上 —— 與現行一致。

`cart-group` 內部**不再保存任何選取狀態**（舊碼用 `goods.isSelected` 就地改物件）；
它只負責把事件往上送，**狀態一律由頁面持有**。這消除了舊碼「改 data 但不 setData」的隱性 bug。

---

## 9. 交付順序（commit 切分與安全點）

| 步 | 內容 | 這一步做完時系統的狀態 |
|---|---|---|
| **T4-0** | 打 tag `pre-p7a2a-t4` | — |
| **T4-1** | `utils/cartView.js` + `tests/unit/frontend/cartView.test.js`（＋O1 若採納） | ✅ **安全點**（純新增，無人引用） |
| **T4-2** | `services/api/_fake/data.js` 加 `thumb` | ✅ **安全點** |
| **T4-3** | `cart-group` 三檔重寫（js／wxml／wxss） | ⛔ **不可單獨停留**（見 F2） |
| **T4-4** | `pages/cart/index.{js,wxml,json}` 重寫 | ✅ **安全點**（T4-3 + T4-4 一起才算完成） |
| **T4-5** | `cart-bar` + `goods-card` 文案／欄位微調 | ✅ **安全點** |
| — | `npm run verify` + 人工驗收 C1–C9 + 逐 commit 稽核 | — |

**⚠️ 中途要停，請停在 T4-1 或 T4-2 之後。** T4-3 與 T4-4 之間購物車頁是壞的。

> **提醒**：`T4-3` 與 `T4-4` 分成兩個 commit 是**為了讓你分段讀 diff**（前者看元件、後者看頁面），
> 不是兩個可獨立回滾的步驟。回滾一律退回 `pre-p7a2a-t4`。

---

## 10. 回滾策略：**用 tag，不用 `repairMode`**

`docs/04-前端規範.md` §7 允許在頁面層用 `repairMode` 切回舊行為，但**T4 不採用**：

| 方案 | 評估 |
|---|---|
| `repairMode` 旗標 | ❌ 整頁重寫，舊碼**不在同一個檔案裡**。要能用旗標切換，就得把舊的 `fetchCartGroupData` 分支留在新頁面內 → 正是規範要避免的「到處都是 if」 |
| **tag + `git revert`** | ✅ 乾淨：舊版完整存在於 `pre-p7a2a-t4` |

**回滾指令**（擇一）：

```
git checkout pre-p7a2a-t4 -- pages/cart services/api/_fake/data.js
git revert <T4-1..T4-5 的 commit>
git reset --hard pre-p7a2a-t4      # 放棄整個 T4
```

---

## 11. 驗收

### 11.1 自動化（`npm run verify` 必須全綠）

| # | 驗收項 | 方式 |
|---|---|---|
| P7a2aT4-A1 | 新測試：`buildCartView` 的分組與小計 | `npm test` |
| P7a2aT4-A2 | 新測試：四種問題碼的分類（三種進失效區、價格變動留在正常區） | 同上 |
| P7a2aT4-A3 | 新測試：`reconcileSelection` 的四條規則（§4.3） | 同上 |
| P7a2aT4-A4 | 新測試：`toLegacyGoodsRequest` 的欄位齊全（若採納 Q-2） | 同上 |
| P7a2aT4-A5 | **既有 918 測試一個都不紅** | `npm test` |
| P7a2aT4-A6 | 前端五條規則 | `npm run check:frontend` |
| P7a2aT4-A7 | 未動 `packages/`、`cloudfunctions/` | `git diff --stat pre-p7a2a-t4 -- packages/ cloudfunctions/` 為空 |
| P7a2aT4-A8 | 未刪除既有頁面 | `git diff --diff-filter=D --name-only` 只允許出現 `index.wxs` |

### 11.2 負向測試（故意違反，必須被擋）

| # | 故意違反 | 預期 |
|---|---|---|
| N1 | 在 `utils/cartView.js` 寫 `wx.` 或 `getStorageSync` | 純函式測試會因 `wx is not defined` 失敗（**這是刻意的界線**） |
| N2 | 在 `pages/cart/` 寫 `canBool(` | `check:frontend` 擋下 |
| N3 | `pages/cart/` 直接 import `services/api/_fake` | `check:frontend` 擋下 |
| N4 | view model 讓失效項 `isSelected = true` | A2 斷言失敗 |

### 11.3 人工驗收（**需要你在開發者工具操作**）

**前置：先種一筆購物車資料**（因為 F1：目前沒有加入入口）。
在開發者工具的 Console 貼上（純字串，無 shell 轉義問題）：

```js
wx.setStorageSync('repair.cart.v1', JSON.stringify({
  items: [
    { lineId: 'prd-1:std', productId: 'prd-1', specId: 'std', quantity: 2,
      addedPriceCents: 2500, currency: 'CNY', addedAt: 1 },
    { lineId: 'prd-2', productId: 'prd-2', specId: null, quantity: 1,
      addedPriceCents: 800, currency: 'CNY', addedAt: 1 },
    { lineId: 'prd-3', productId: 'prd-3', specId: null, quantity: 1,
      addedPriceCents: 450, currency: 'CNY', addedAt: 1 },
    { lineId: 'prd-4', productId: 'prd-4', specId: null, quantity: 1,
      addedPriceCents: 3200, currency: 'CNY', addedAt: 1 }
  ],
  updatedAt: 1
}));
```

然後重新進入購物車 tab。

| # | 驗收項 | 預期 |
|---|---|---|
| C1 | tabBar 第 3 項「購物車」可進入，且標題為「購物車」 | 目視 |
| C2 | `prd-1`（stock 20）與 `prd-2`（stock 3）顯示在正常區，名稱為「冷媒 R410／排水管接頭」 | 目視 |
| C3 | `prd-3`（stock 0）與 `prd-4`（isActive false）顯示在**失效區**，文字為「已售完」／「已下架」，**沒有勾選框** | 目視 |
| C4 | 合計 = 25.00×2 + 8.00×1 = **¥58.00**（不含失效項） | 目視 |
| C5 | 取消勾選 `prd-2` → 合計變 **¥50.00**、按鈕變「去結算(2)」 | 操作 |
| C6 | `prd-2` 數量加到 4（> stock 3）→ 被擋下並提示庫存不足 | 操作 |
| C7 | 右滑刪除 `prd-1` → 消失且 Storage 內也少了該筆 | 操作＋Console 檢查 |
| C8 | 「清除失效商品」→ 失效區消失、Storage 剩 2 筆 | 操作 |
| C9 | **畫面完全沒有**「門店」「優惠券」「促銷」「去凑单」「已优惠」字樣 | 目視 |
| C10 | **改價測試**：把 `data.js` 的 `prd-1.priceCents` 改成 `2900` → 購物車仍顯示 **¥25.00**（加入時價格）＋黃字「價格已變動」；按結算 → 彈窗顯示 25.00 → 29.00 | 改資料後操作 |
| C11 | **下架測試**：按 C10 的彈窗「繼續」前，先把 `prd-2.isActive` 改成 `false` → 按結算 → 自動移除 `prd-2` 並提示，`prd-1` 仍可結算 | 改資料後操作 |
| C12 | 空車（清空 Storage）→ 顯示「購物車是空的」＋「去逛逛零件」→ 點擊跳到商品列表頁 | 操作 |
| C13 | 按「去結算」後**結算頁不會白屏**（§7.3 的橋接有效） | 操作 |

> C10／C11 **需要你手動改 `services/api/_fake/data.js`** —— 這是刻意的（沿用 P7a-2a 計畫 §7.3 的做法）：
> 讓邊界情況可被目視驗證，而不是只存在於測試裡。**測完請改回來。**

---

## 12. 風險

| # | 風險 | 對策 |
|---|---|---|
| R1 | `cart-group` 與頁面必須同 commit 切換（F2） | §9 的順序；中途停在 T4-1／T4-2 |
| R2 | **我看不到畫面**，樣式與排版只能靠你目視 | wxss 只**刪除**已無對應節點的規則，不新增、不重構既有規則；C1–C13 逐項驗 |
| R3 | 失效區的樣式原本沒被用過（`.invalid-goods-wrap` 系列） | 它是 TDesign 為此情境寫的，且我保留了它的完整規則；C3 目視確認 |
| R4 | `services/cart/cart.js` 與 `model/cart.js` 變成死代碼 | **不刪**（紅線 7：代碼保留）。標記 `@deprecated`，見 Q-4 |
| R5 | T4 完成後、T6 完成前，點購物車商品會進**舊的商品詳情頁**：該頁吃 `spuId`，而 `prd-*` 在它的 mock 裡查不到（`model/good.js:1891` 的 `genGood` 用 `id % allGoods.length` 取值，字串 id 會得到 `NaN`）→ **不會崩，但會是空白殘缺的一頁** | T4 的跳轉**同時帶 `productId` 與 `spuId`**（值都是 `productId`），T6 會把詳情頁的參數契約正式定為 `productId`；此過渡狀態記在 commit message |
| R6 | 價格變動後以新價結算，與購物車顯示的舊價不一致 | Dialog 文字**明示**新價（§7.1）；payload 帶 `expectedPriceCents` 讓後端可複核 |
| R7 | 舊結算頁在 T7 前仍顯示電商內容（門店、優惠券、發票） | 那是 T7 的範圍；T4 只保證「不白屏」 |
| R8 | `fetchProducts()` 在 `onShow` 每次都打（fake 有 120ms 延遲） | fake 階段可接受；P7b 接真後端時應改為快取 + 失效重取，已記在 §13 Q-3 一併討論 |

---

## 13. 待你確認（**動手前需要你的答覆**）

| # | 問題 | 我的建議 | 阻塞什麼 |
|---|---|---|---|
| **Q-1** | **T4 目前沒有「加入購物車」入口（F1），人工驗收要靠 §11.3 的 Storage 種子。** 你要 (a) 照原順序做 T4，用種子驗收；還是 (b) 先做 T6（商品詳情加入購物車），再回頭做 T4？ | **(a) 照原順序** —— T4 是被 T6 依賴的介面，先把消費端定下來，T6 才知道要寫入什麼形狀 | 人工驗收方式 |
| **Q-2** | **要不要寫 `order.goodsRequestList` 相容橋接？**（§7.3；不寫則 T4 之後結算頁會 `JSON.parse(undefined)` 白屏） | **(a) 寫**，並在 T7 明列為必刪項目 | 結算頁在 T4–T7 之間是否可用 |
| **Q-3** | `fetchProductCatalogIndex()` 在 T4 之後**無人呼叫**（F3 的後果）。要 (a) 保留、(b) 刪除（連同 real 佔位與契約測試）、(c) 保留並改由 `cartView` 使用？ | **(a) 保留** —— 它是 §3.7.6 校驗的後端契約；P7b 會用到。但需在檔案註解說明「目前無人呼叫」 | 是否留下一段死代碼 |
| **Q-4** | `services/cart/cart.js`、`model/cart.js` 變成死代碼，要標 `@deprecated` 嗎？（不刪） | **要**，加註解說明「已由 utils/cart.js 取代」 | 檔案是否要動（超出 §5 清單） |
| **Q-5** | §5.3 的 O1（`normalizeCart` 抽出並補測試）、O2（刪 `index.wxs`）要不要一起做？ | **O1 要**（Storage 是唯一外部邊界卻無測試）；**O2 要**（純死碼） | T4 的 diff 大小 |
| **Q-6** | 商品詳情的跳轉參數：T4 先帶 `productId`＋`spuId`（R5），T6 再正式改成 `productId`。可接受嗎？ | 可接受，這是唯一不讓 T4 破壞 T6 的辦法 | T6 的參數契約 |
| **Q-7** | 需要我把這些決策回寫進 `docs/P7a-2a-計畫.md`（標記 T4 已完成與偏離）與 `SESSION-HANDOFF.md` 嗎？ | 要，做完 T4 後一併更新 | 文件一致性 |

---

## 14. 明確不在 T4 範圍

| 項目 | 屬於 |
|---|---|
| 商品詳情的「加入購物車」實際寫入 | T6 |
| 商品列表、商品詳情改造 | T5／T6 |
| 結算頁移除優惠券／發票、改讀 `repair.checkout.v1` | T7 |
| **刪除 §7.3 的相容橋接** | **T7（必辦）** |
| 首頁「常用零件」區塊、分類頁、tabBar 第 2 項改名「分類」 | P7a-2b |
| 購物車 tabBar 上的數量角標 | 未排（`custom-tab-bar` 目前不讀購物車） |
| 購物車改存後端 | P7b |
| 庫存原子扣減、混合訂單交易 | P2／P5 |

---

## 15. 順手發現的文件不一致（要不要修，由你決定）

**這些都不是 T4 造成的，是先前改造留下的**，我看到就記下來，不在 T4 動手：

| # | 位置 | 問題 |
|---|---|---|
| D1 | `docs/01-目標架構.md` §10.1／§10.2（約 2860–2879 行） | 仍寫「tabBar＝首頁/服務/訂單/我的」且「**購物車下線**」，與 §3.7.5／§3.7.7／§3.7.9 的最新決策（5 項、含購物車、第 2 項叫「分類」）**矛盾** |
| D2 | `custom-tab-bar/index.js` 註解、`custom-tab-bar/data.js` 註解 | 仍寫「這 **4** 項」，T3 之後已是 **5** 項 |
| D3 | `docs/01-目標架構.md` §7.1 集合清單 | **沒有 `carts`、沒有 `categories` 集合**。`categories` 是 §3.7.9 新增的需求；購物車後端化（P7b）也需要新集合。**P2 開工前需要補** |
| D4 | `docs/P7a-計畫.md` §2 M12、§5 P7a-C4 | 仍寫「購物車僅移除入口、代碼保留」，已被 §3.7.7 撤銷（該檔未同步） |

---

**⏸ 等你回覆 §13 的 Q-1～Q-7，我才開始動代碼。**

**再次提醒（沿用 P7a-2a 計畫 §0）：購物車做完了，仍然沒有任何真實後端。**
前端完成 ≠ 專案可上線；`services/api/_fake/data.js` 之外，系統目前不儲存任何一筆真實資料。
