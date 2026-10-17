# P7a-2a / T7 逐檔計畫 —— 結算頁與下單流程

> 產出日期：2026-10-17
> 分支：`refactor/hexagonal`（HEAD = `d3d4686`，T6b 已完成）
> **狀態：✅ 已完成（2026-10-17）。T7-1／T7-2／T7-3／T7-4／T7-5 全部交付。**
> 依據：`docs/01` §3.8（訂單生成與流轉契約）、`docs/P7a-2a-T4-計畫.md` §7.3／§14、
> `docs/SESSION-HANDOFF.md` §6.2、`docs/04-前端規範.md`

---

## 1. 現況診斷

| # | 現況 | 問題 |
|---|---|---|
| D1 | 購物車結算同時寫 `repair.checkout.v1` 與 **舊格式** `order.goodsRequestList` | T4 的相容橋接；T7 必須徹底移除 |
| D2 | 結算頁 `pages/order/order-confirm` 直接 `JSON.parse(order.goodsRequestList)` | 舊格式消失就白屏；與新契約完全不相容 |
| D3 | 結算頁仍是完整電商流程（門店、運費、優惠券、發票、備註、`fetchSettleDetail`、`commitPay`） | 維修場景不需要；也依賴舊 mock |
| D4 | 詳情頁「立即購買／立即預約」只給 Toast | 沒有導向結算頁，也沒有 payload |
| D5 | 商品有規格時，「立即購買」沒有選 SKU 的路徑 | 直接下單會不知道買哪個規格 |
| D6 | 沒有純函式負責「結算 payload → 畫面／金額」 | 金額與明細規則會散在頁面裡，無法測試 |
| D7 | P7a 沒有訂單後端／支付 | 提交只能模擬成功，不能真的建立訂單 |

**結論**：T7 要**重寫結算頁的資料與呈現層**，並把購物車／詳情頁的入口統一到
`repair.checkout.v1` 的 §3.8 契約。

---

## 2. 目標流程

```
購物車「結算」 ─────────────┐
詳情頁「立即購買」（商品） ──┼→ 寫入 repair.checkout.v1（§3.8 契約）
詳情頁「立即預約」（服務） ──┘        ↓
                              結算頁（pages/order/order-confirm）
                                ├─ 讀 payload
                                ├─ fetchProducts／fetchServices 取得現價與名稱
                                ├─ checkoutView 純函式：明細、材料費、服務費、合計
                                ├─ 顯示預約時間佔位（服務／混合）
                                └─ 提交 → 模擬成功 → 清購物車 → 我的訂單 tab
```

---

## 3. 結算 payload（`repair.checkout.v1`）

以 `docs/01` §3.8.2 的契約為**核心**，另加三個 P7a 前端用的欄位（不進後端）：

```js
{
  // ── §3.8 契約 ──
  orderType: 'product' | 'service' | 'mixed',
  items: [{
    itemType: 'product' | 'service',
    itemId,              // productId 或 serviceId
    skuId,               // 只有有規格的商品；無規格省略／null
    quantity,            // 整數 ≥ 1；服務恆為 1
  }],
  expectedTotalCents,    // 前端顯示金額（後端必須重算）

  // ── P7a 前端附加（不進後端） ──
  source: 'cart' | 'buy-now' | 'service',
  cartLineIds: [],       // source='cart' 時，成功後要移除的購物車明細
  appointmentAt: null,   // 服務／混合單的預約時間佔位（P7a-2b 才選時段）
  addressId: null,       // 目前選擇的地址（P7a 只顯示；P5 的下單契約再收）
}
```

| 來源 | `orderType` | `items` |
|---|---|---|
| 購物車 | `product` | 每個已勾選 line → `{ itemType:'product', itemId:productId, skuId:specId(實為 skuId), quantity }` |
| 商品立即購買 | `product` | 單一商品；有規格時帶 `skuId` |
| 服務立即預約 | `service` | `{ itemType:'service', itemId:serviceId, quantity:1 }` |
| 混合單（P7a-2b 才有入口） | `mixed` | 服務＋零件明細；T7 的結算頁先支援顯示 |

> ⚠️ `source`／`cartLineIds`／`appointmentAt`／`addressId` 是 **P7a 的前端 metadata**；
> P5 的 `CreateOrder` 只會收 §3.8 的三個核心欄位（地址由 `addressId` 另外帶）。

---

## 3.1 服務地址（Q-2 已確認：接舊地址流程＋預設地址）

**只做讀取與顯示，不改地址編輯／列表的既有架構。**

| 時機 | 行為 |
|---|---|
| 進入結算頁 | 呼叫既有的 `fetchDeliveryAddressList()`，找 `isDefault === 1` 或 `isDefault === true` 的地址 |
| 有預設地址 | 自動填入（姓名／電話／完整地址） |
| 沒有預設地址 | 顯示「請選擇地址」 |
| 點地址卡 | `wx.navigateTo('/pages/user/address/list/index?selectMode=1&isOrderSure=1')` |
| 從地址列表返回 | 用既有的 `getAddressPromise()`／`resolveAddress()` 接收選擇，更新畫面 |
| 選擇後 | 只更新結算頁的顯示與 `addressId`；**不改地址資料、不寫回「我的」** |

> ⚠️ mock 的 `model/address.js` 用 `isDefault: 1`（數字），不是 boolean；
> 判斷時兩種都接受。目前 `genAddressList()` 的第 0 筆就是預設地址。
> P5 接上真後端後，預設地址由 `addresses` 集合決定。

---

## 4. 金額規則

結算頁以**現價**重新計算（假資料穩定；P5 後端也會重算）：

| 欄位 | 規則 |
|---|---|
| `materialTotalCents` | 所有 `itemType='product'` 的 `單價 × quantity`（材料費） |
| `serviceTotalCents` | 所有 `itemType='service'` 的 `單價 × quantity`（服務費） |
| `goodsTotalCents` | `material + service`（商品總額） |
| `expectedTotalCents` | payload 帶進來的金額；與現價總額不同時顯示「價格已更新」 |
| `totalCents` | 現價總額（提交時顯示與使用） |

單價來源：

| 項目 | 單價 |
|---|---|
| 有規格商品 | 該 `skuId` 的 `priceCents`；找不到 SKU → 該列失效 |
| 無規格商品 | 商品層 `priceCents` |
| 服務 | 服務層 `priceCents` |

- 有規格但 payload 沒帶 `skuId` → 該列失效（阻擋提交）。
- 商品／服務／SKU 找不到 → 該列失效（阻擋提交）。
- 失效列**不計入**任何金額。

---

## 5. 逐檔計畫

### 修改（M）

| # | 檔案 | 改動 |
|---|---|---|
| M1 | `utils/cart.js` | `toCheckoutPayload()` 改為 §3.8 形狀：`source`／`orderType`／`items[{itemType,itemId,skuId,quantity}]`／`expectedTotalCents`／`cartLineIds` |
| M2 | `pages/cart/index.js` | 移除 `LEGACY_CHECKOUT_KEY` 與舊格式寫入；`CHECKOUT_KEY` 改由 `utils/checkoutView.js` 匯出；其餘結算流程不變 |
| M3 | `utils/cartView.js` | 刪除 `toLegacyGoodsRequest()`／`LEGACY_STORE_ID`／`LEGACY_STORE_NAME` 與匯出 |
| M4 | `tests/unit/frontend/cartView.test.js` | 刪除 `toLegacyGoodsRequest` 測試組 |
| M5 | `tests/unit/frontend/cart.test.js` | 改寫「結算 payload」測試（新契約） |
| M6 | `pages/order/order-confirm/index.js` | **重寫**：讀 `repair.checkout.v1`、抓 `fetchProducts`／`fetchServices`、用 `checkoutView` 組畫面、**讀取預設地址／接地址選擇**、模擬提交成功 |
| M7 | `pages/order/order-confirm/index.wxml` | **重寫**：地址佔位、明細、服務費／材料費／合計、預約時間佔位、錯誤／失效列、提交列 |
| M8 | `pages/order/order-confirm/index.wxss` | **重寫**：只留新畫面的樣式 |
| M9 | `pages/order/order-confirm/index.json` | 只留實際使用的元件（`t-toast`／`t-icon`／`t-image`／`price`） |
| M10 | `pages/goods/details/index.js` | 「立即購買」→ 商品結算；「立即預約」→ 服務結算；有規格時開規格彈窗（`buy-now` 模式） |
| M11 | `pages/goods/details/index.wxml` | 規格彈窗傳 `confirm-text`（加入購物車／立即購買） |
| M12 | `pages/goods/details/components/goods-specs-popup/index.js`／`index.wxml` | 新增 `confirmText` 屬性，按鈕文字由頁面決定 |

### 新增（N）

| # | 路徑 | 職責 |
|---|---|---|
| N1 | `utils/checkoutView.js` | `CHECKOUT_KEY`、`orderTypeOf()`、`validatePayload()`、`buildCheckoutView()`、`specTextOf()`；純函式 |
| N2 | `tests/unit/frontend/checkoutView.test.js` | 契約驗證、明細組裝、材料費／服務費／合計、失效列、價格變動、真實 fake 資料 |
| N3 | `docs/P7a-2a-T7-計畫.md` | 本文件 |

### 刻意不動

| 檔案 | 原因 |
|---|---|
| `pages/orders/index`（訂單 tab） | 目前是 P7a-1 骨架；填入內容屬 **P7a-2**。T7 成功後導向這裡並在文件標明 |
| `pages/order/order-list/**`（舊電商訂單列表） | 舊 mock；P2 之後接新訂單 |
| `pages/order/order-confirm/pay.js`／`*.wxs`／`components/address-card` | 重寫後不再引用；**先留檔不刪**，避免一次改動過大（文件標記可清理） |
| `pages/order/components/selectCoupons`／`noGoods` | 不再是結算頁依賴；留待後續清理 |
| `app.json` | 結算頁已在路由中，不需要新增 |

---

## 6. 結算頁畫面規格

```
┌────────────────────────────────────┐
│ 服務地址                            │
│ [姓名] [電話]                       │  ← 預設地址自動填入
│ [完整地址]                          │     沒有預設 →「請選擇地址」
├────────────────────────────────────┤
│ 商品明細                            │
│ [圖] 名稱／規格          ¥單價 ×數量 │
│ …（失效列標紅並說明原因）            │
├────────────────────────────────────┤
│ 服務費                  ¥X          │
│ 材料費                  ¥Y          │
│ 商品總額                ¥X+Y        │
│ 合計                    ¥X+Y（粗體） │
├────────────────────────────────────┤
│ 預約時間：待選擇（P7a-2b）           │  ← 只有 service／mixed 顯示
├────────────────────────────────────┤
│ 價格已更新，請確認後再提交（橫幅）    │  ← expected ≠ 現價時顯示
├────────────────────────────────────┤
│              合計 ¥X+Y   [提交訂單]  │  ← 固定在底部
└────────────────────────────────────┘
```

**狀態**

| 狀態 | 畫面 |
|---|---|
| 讀不到 payload／payload 不合法 | 「沒有結算資料」＋「返回」 |
| API 載入中 | 載入中畫面 |
| 有失效列 | 明細標紅；提交按鈕停用；Toast 說明原因 |
| `expectedTotalCents` 與現價不同 | 顯示「價格已更新」；**允許提交**（以現價為準） |
| 正常 | 可提交 |

---

## 7. 提交（P7a 模擬）

```
點「提交訂單」
  → 有失效列？→ Toast，停
  → wx.showModal：標題「下單成功（模擬）」
       內容「P7a 階段尚未串接支付與後端；正式下單在 P5／P6。」
  → 確認後：
       ① source === 'cart' → 依 cartLineIds 移除已購買的購物車明細並存回
       ② 移除 repair.checkout.v1
       ③ wx.switchTab('/pages/orders/index')
```

⚠️ **訂單 tab 目前是 P7a-1 骨架**（`pages/orders/index` 只有 `ready`），
所以「跳過去」會看到空白骨架。這是**已知限制**：
訂單列表屬 **P7a-2**；T7 不越權改它。若你不希望跳到空白頁，見 §11 Q-1。

---

## 8. 詳情頁入口

### 8.1 商品「立即購買」

| 情況 | 行為 |
|---|---|
| 無規格 | 直接寫 payload（`source:'buy-now'`，quantity 1）→ 結算頁 |
| 有規格 | 開規格彈窗（按鈕文字「立即購買」）；選好 SKU 後寫 payload → 結算頁 |

- 沿用 `findSkuBySelection()` 與 `buyNum`；SKU 價格寫入 `expectedTotalCents`。
- `goods-specs-popup` 新增 `confirmText` 屬性（預設「加入購物車」）。
- 加入購物車與立即購買共用同一個彈窗；頁面用 `this.specAction` 分流
  （`'cart'`／`'buy-now'`）。

### 8.2 服務「立即預約」

```js
{
  source: 'service',
  orderType: 'service',
  items: [{ itemType: 'service', itemId: serviceId, quantity: 1 }],
  expectedTotalCents: detail.priceCents,
  appointmentAt: null,   // P7a-2b 才選時段
}
```

- 預約時間在結算頁顯示「待選擇（P7a-2b）」。
- 服務不進購物車（§3.7.2）。

---

## 9. Commit 切分

| # | commit | 內容 | 驗證 |
|---|---|---|---|
| **T7-0** | 計畫存檔 | N3 | — |
| **T7-1** | 移除相容橋接 | M1–M5：`cart.toCheckoutPayload` 改契約、刪 `toLegacyGoodsRequest` 與舊 key 寫入、更新測試 | `npm run verify`；grep 舊符號 0 |
| **T7-2** | 結算純函式 | N1＋N2 | `npm run verify`；新測試全過 |
| **T7-3** | 結算頁重寫 | M6–M9 | `npm run verify`；人工 C1–C6 |
| **T7-4** | 詳情頁入口 | M10–M12 | `npm run verify`；人工 C7–C9 |
| **T7-5** | 文件 | handoff／`P7a-2a-計畫.md`／本文件／`docs/01` §3.8 的 P7a metadata 註記 | `npm run verify` |

> 每個 commit 前用 `npm run verify > verify.log 2>&1; echo $?` 檢查真實退出碼。

---

## 10. 驗收

### 10.1 自動

| # | 項目 | 預期 |
|---|---|---|
| A1 | `npm run verify` | 每個 commit exit 0 |
| A2 | `checkoutView.test.js` | 契約驗證、明細、SKU 價格、服務費／材料費、失效列、價格變動、混合單 |
| A3 | `cart.test.js`／`cartView.test.js` | 新 payload 形狀；舊橋接測試已刪 |
| A4 | grep | `LEGACY_CHECKOUT_KEY`／`toLegacyGoodsRequest`／`order.goodsRequestList` 在程式中 **0 筆** |

### 10.2 人工

| # | 操作 | 預期 |
|---|---|---|
| C0 | 進入結算頁 | **自動帶入預設地址**（mock 的第 0 筆，`isDefault: 1`） |
| C0b | 手動移除預設／改成無預設 | 顯示「請選擇地址」；點擊進地址列表，選擇後返回並顯示新地址 |
| C1 | 購物車勾選商品→結算 | 結算頁顯示明細；材料費＝商品總額；服務費 0 |
| C2 | 服務詳情→立即預約 | 結算頁顯示服務費、合計、預約時間佔位 |
| C3 | 無規格商品→立即購買 | 結算頁顯示該商品 |
| C4 | `prd-1`→立即購買 | 規格彈窗按鈕為「立即購買」；選大罐→結算頁單價 4800 |
| C5 | 手動塞 `mixed` payload | 服務費＋材料費分開顯示 |
| C6 | 手動讓 `expectedTotalCents` 不同 | 「價格已更新」橫幅；金額用現價 |
| C7 | 手動塞不存在的商品／缺 skuId | 該列失效、提交停用 |
| C8 | 提交 | 成功 modal；購物車已移除購買明細；`repair.checkout.v1` 已清除；導向訂單 tab |
| C9 | 舊 key 檢查 | Storage 不再有 `order.goodsRequestList` |
| C10 | 無橫向溢出 | 目視 |

---

## 11. 已確認的四點（2026-10-17）

| # | 問題 | 決議 |
|---|---|---|
| **Q-1** | 提交成功後導向哪裡？ | ✅ **訂單 tab**（`/pages/orders/index`）。目前是 P7a-1 骨架，內容屬 P7a-2；文件已標明 |
| **Q-2** | 地址怎麼處理？ | ✅ **接舊地址流程＋預設地址**：進入結算頁讀取 `fetchDeliveryAddressList()` 的 `isDefault`；沒有預設顯示「請選擇地址」，可跳地址列表；只做讀取與顯示，不改編輯架構 |
| **Q-3** | 有規格商品的「立即購買」？ | ✅ **一律開規格彈窗**（按鈕文字「立即購買」），選好 SKU 與數量再進結算 |
| **Q-4** | 價格變動時？ | ✅ **顯示橫幅、允許提交**（以現價為準） |

---

## 12. 紅線檢查

| 紅線 | T7 |
|---|---|
| 不動資料庫 | ✅ |
| 不建雲函數 | ✅ |
| 只改結算頁、購物車頁、詳情頁結算跳轉、utils、測試 | ✅ 檔案見 §5 |
| 頁面只能透過 `services/api/index.js` 取資料 | ✅ 結算頁用 `fetchProducts`／`fetchServices` |
| 服務不進購物車 | ✅ 服務走 `source:'service'`，不碰 cart |
| 不用 shell 做取代 | ✅ 全程 Edit／Write |
| `npm run verify` 必須綠 | ✅ 每個 commit 檢查 |

---

## 13. 風險

| # | 風險 | 對策 |
|---|---|---|
| R1 | 訂單 tab 是骨架，提交後看到空白 | 文件明寫；P7a-2 會填；或用 Q-1 的替代方案 |
| R2 | 沒有真實支付／訂單 | 成功 modal 明確寫「模擬」；P5／P6 再接 |
| R3 | 地址是舊 mock（`model/address.js`），新增／編輯不會真的持久化 | 結算頁只讀取與選擇；正式地址由 P5 的 `addresses` 集合接上 |
| R4 | 混合單沒有 UI 入口 | 結算頁先支援顯示；入口屬 P7a-2b |
| R5 | 舊電商檔案留在 repo | 先停止引用、留檔；文件標記可清理，避免一次刪太多 |
| R6 | WXML 沒有編譯期檢查 | 依事件綁定與元件註冊逐項核對（T7-3／T7-4 各自核對） |

---

## 14. 回滾

| commit | 回滾方式 |
|---|---|
| T7-1 | `git revert`（cart＋cartView＋測試） |
| T7-2 | `git revert`（新增純函式與測試） |
| T7-3 | `git revert`（結算頁四檔） |
| T7-4 | `git revert`（詳情頁與規格彈窗） |
| T7-5 | `git revert`（文件） |

---

## 15. 執行結果（2026-10-17）

| 階段 | commit | 結果 |
|---|---|---|
| 計畫 | `907c776` | 本文件批准存檔 |
| **T7-1** | `dfdb37a` | 移除 T4 相容橋接；`cart.toCheckoutPayload` 改 §3.8 契約；舊測試刪除／改寫 |
| **T7-2** | `7791bd3` | `utils/checkoutView.js`＋29 項測試（明細、材料費／服務費、失效列、價格變動） |
| **T7-3** | `524513a` | 結算頁重寫：預設地址、明細、金額、價格變動、模擬提交 |
| **T7-4** | `c5a62f5` | 詳情頁立即購買／立即預約接結算；規格彈窗 `confirmText` |
| **T7-5** | 本次收尾 | handoff／`P7a-2a-計畫.md`／本文件／`docs/01` §3.8 註記 |

**自動驗證**：每個 commit 後 `npm run verify` 皆 exit 0；最終測試 **1178**。
**人工驗收**：C0–C10 待使用者在開發者工具執行。

**已知限制**：
- P7a 沒有支付與訂單後端，提交只做**模擬成功**；成功後導向訂單 tab，該頁目前是 P7a-1 骨架。
- 地址只是讀取 mock 的預設地址與既有選擇流程，編輯與持久化仍是 P5 的工作。
- 混合單的入口屬 P7a-2b；T7 的結算頁已能顯示。
- 舊電商結算檔案（`pay.js`／`*.wxs`／`components/address-card`／`pages/order/components/selectCoupons`、`noGoods`）已不再被引用，先留檔待後續清理。
