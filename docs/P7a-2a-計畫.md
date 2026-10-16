# P7a-2a 逐檔計畫（待確認）

> 產出日期：2026-10-16
> 分支：`refactor/hexagonal`（P7a-1 已完成）
> 前置：`docs/01-目標架構.md` **§3.7**、`docs/04-前端規範.md`、`docs/P7a-計畫.md`
> **狀態：計畫。未動任何代碼。**
> **範圍：購物車 + 商品列表 + 商品詳情 + 購物車結算。**
> **不含：服務詳情、加購零件、服務立即下單（那是 P7a-2b）。**

---

## 0. ⚠️ 必須先記下的一句話

> **P7a-2a／P7a-2b 完成後，若 P2-0 探針未跑，後端無法開工。**
> **前端完成 ≠ 專案可上線。**

**這不是免責聲明，是排程事實**：

| 已完成（純前端） | 未完成（需雲端） |
|---|---|
| tabBar、路由、fake API | 資料庫集合與權限 |
| 購物車、商品、服務的介面 | Repository 與 Use Case |
| 前端 CI 與規範 | 支付、分帳、退款 |
| **903+ 測試**（全部離線） | **零**真實後端 |

**目前整個系統跑的是 `services/api/_fake/data.js` 的假資料。** 沒有任何一筆真實資料會被儲存或讀取。

---

## 1. 授權範圍

| 項目 | 狀態 |
|---|---|
| 動 `pages/`、`components/`、`services/`、`utils/`、`custom-tab-bar/`、`app.json`、`config/` | ✅ 已授權（P7a 範圍） |
| 動 `packages/`、`cloudfunctions/` | ❌ **完全不碰** |
| 動資料庫 | ❌ |

---

## 2. ⚠️ 本階段的一個關鍵限制

**P7a-2a 只能做「純商品」的購物車流程，無法驗證庫存扣減。**

§3.7.4 的庫存規則是**後端責任**（原子扣減、混合訂單交易）。P7a-2a 的 fake 只能**模擬**：

| 行為 | P7a-2a 怎麼做 | 真實實作 |
|---|---|---|
| 庫存不足 | fake 的 `checkout()` 比對數量後回傳錯誤 | P5 的 Use Case + **P2-0 決策的原子扣減** |
| 商品下架 | fake 檢查 `isActive` | 後端 |
| 價格變動 | fake 保存「加入時價格」並在結算時比對 | 後端 |

**這代表 P7a-2a 的驗收是「UI 對不對」，不是「庫存對不對」。** 後者要等 P2／P5。

---

## 3. 既有檔案修改（8 檔）

| # | 檔案 | 改動摘要 | 風險 |
|---|---|---|---|
| M1 | `custom-tab-bar/data.js` | 由 4 項改為 **5 項**（插入「購物車」於第 3 位） | **中**（全站導覽） |
| M2 | `app.json` | `tabBar.list` 加 `pages/cart/index`，**滿 5 項** | 中 |
| M3 | `pages/cart/index.js/.wxml` | 改造為**純商品**購物車：移除電商促銷／優惠券相關；接 fake API | **高**（既有頁面） |
| M4 | `pages/goods/list/index.js/.wxml` | 商品列表：接 fake、顯示庫存狀態 | 中 |
| M5 | `pages/goods/details/index.js/.wxml` | 商品詳情：**只保留「加入購物車」**（**不含**「立即下單」——那是服務專屬） | **高** |
| M6 | `pages/order/order-confirm/index.js/.wxml` | 購物車結算：移除優惠券／發票區塊；加「價格已變動」提示 | **高** |
| M7 | `services/api/_fake/data.js` | 擴充 `PRODUCTS`：加 `stock`、`specs`、`addedPriceCents` 概念 | 低 |
| M8 | `services/api/_fake/index.js` + `services/api/index.js` | 新增購物車 API（見 §4.1） | 低 |

> **M3／M5／M6 是「改既有頁面」**，各別單獨 commit + 打 tag，可逐頁 revert。

---

## 4. 新增檔案（4 檔）

| # | 路徑 | 職責 |
|---|---|---|
| N1 | `utils/cart.js` | 購物車本機狀態（P7a-2a 用 `wx.setStorageSync`；**P7b 改為後端購物車**）。純函式：`addItem`／`removeItem`／`updateQty`／`totalCents`／`validate` |
| N2 | `utils/cartCodes.js` | 購物車問題碼（`OUT_OF_STOCK`／`DELISTED`／`PRICE_CHANGED`／`LIMIT_EXCEEDED`） |
| N3 | `tests/unit/frontend/cart.test.js` | 購物車純函式的測試（含 §3.7.6 的四種邊界情況） |
| N4 | `tests/unit/frontend/cartApi.test.js` | fake 購物車 API 的形狀測試 |

---

## 5. 設計要點

### 5.1 購物車 API（新增到 `services/api/`）

```js
fetchCart()                          // → { items, totalCents, issues }
addToCart({ productId, specId, quantity })
updateCartQuantity({ lineId, quantity })
removeCartLine({ lineId })
checkoutCart({ addressId, appointmentAt })   // → 訂單（P7a-2a 回傳 fake 訂單）
```

### 5.2 ⚠️ 購物車只放商品，**服務永遠不進來**

§3.7.2 的核心規則。做法：`cart.addItem` 只接受 `itemType === 'product'`，服務項一律拒絕：

```js
// utils/cart.js
function addItem(cart, item) {
  if (item.itemType !== 'product') {
    return { ok: false, code: 'SERVICE_NOT_CARTABLE' };  // 服務一律走立即下單
  }
  ...
}
```

**這是在型別層面把規則固定下來**，而不是靠呼叫端記得。

### 5.3 四種邊界情況的實作位置（§3.7.6）

| 情況 | 偵測時機 | 實作位置 |
|---|---|---|
| 商品被搶光 | **結算時** | `cart.validate()` 比對 `stock` |
| 商品下架 | **結算時** | `cart.validate()` 比對 `isActive` |
| 商品改價 | 顯示用**加入時價格**；結算時提示 | `cart` 保存 `addedPriceCents`；`validate()` 比對當前價 |
| 上限 50 項 | 加入時 | `addItem()` 檢查 `items.length >= 50` |

**為什麼「搶光／下架」在結算時才偵測，而不是加入時**：加入時檢查會讓「加入後才被搶光」的商品靜默留在購物車，使用者在結算時才發現 —— 那更糟。結算時統一檢查並標紅，一次講清楚。

### 5.4 價格顯示：加入時 vs 當前

| 位置 | 顯示 |
|---|---|
| 購物車列表 | **加入時的價格** |
| 結算頁 | 當前價格 + 「價格已變動」提示（若有差異） |

理由見 §3.7.6：購物車是「使用者當時看到的價格」的承諾。

### 5.5 商品詳情頁**不得**有「立即下單」

「立即下單」是**服務專屬**（§3.7.2）。商品詳情只有「加入購物車」與「去購物車」。

> 這條會在驗收中以**人工目視**確認 —— 靜態規則難以表達「這個按鈕不該存在」。

---

## 6. npm script 變更

**無。** 不動任何 script 與依賴。

---

## 7. 驗收標準

### 7.1 自動化

| # | 驗收項 | 指令 | 預期 |
|---|---|---|---|
| P7a2a-A1 | 前端 CI（含既有 5 條規則） | `npm run check:frontend` | `exit=0` |
| P7a2a-A2 | 購物車純函式測試 | `npm test` | 含 §3.7.6 四種邊界 |
| P7a2a-A3 | **服務不得進購物車** | `npm test` | `addItem` 對 `itemType='service'` 回 `SERVICE_NOT_CARTABLE` |
| P7a2a-A4 | 上限 50 項 | 同上 | 第 51 項被拒 |
| P7a2a-A5 | 既有 863 測試不受影響 | `npm test` | 一個都不紅 |
| P7a2a-A6 | `npm run verify` | — | 全綠 |

### 7.2 靜態

| # | 驗收項 | 指令 | 預期 |
|---|---|---|---|
| P7a2a-B1 | tabBar 恰好 5 項 | `node -e "console.log(require('./app.json').tabBar.list.length)"` | **5** |
| P7a2a-B2 | tabBar 頁面全在主包 | 同上檢查 | 全部 |
| P7a2a-B3 | 未刪除既有頁面 | `git diff --diff-filter=D` | **空** |
| P7a2a-B4 | 未動 `packages/`、`cloudfunctions/` | `git diff --stat <base> -- packages/ cloudfunctions/` | **空** |

### 7.3 人工驗收（需你在開發者工具確認）

| # | 驗收項 | 方式 |
|---|---|---|
| P7a2a-C1 | tabBar 顯示 5 項且購物車可點 | 目視 |
| P7a2a-C2 | 商品詳情**有**「加入購物車」、**沒有**「立即下單」 | 目視 |
| P7a2a-C3 | 加入後購物車數量正確、總價正確 | 操作 |
| P7a2a-C4 | **改 data.js 的庫存為 0 → 結算時該項標紅不可結算** | 改 fake 資料後操作 |
| P7a2a-C5 | **改 data.js 的價格 → 購物車顯示舊價、結算提示價格變動** | 同上 |
| P7a2a-C6 | 既有下線功能（優惠券／發票）在結算頁**不再出現** | 目視 |

> C4／C5 需要你**手動改 fake 資料**來觸發 —— 這是刻意的：讓邊界情況可被目視驗證，
> 而不是只存在於測試裡。

### 7.4 負向測試

| # | 故意違反 | 預期 |
|---|---|---|
| P7a2a-N1 | 把服務項加進購物車 | `addItem` 拒絕 |
| P7a2a-N2 | 超過 50 項 | 第 51 項被拒 |
| P7a2a-N3 | 在商品詳情加「立即下單」按鈕 | **人工驗收 C2**（靜態規則難以表達） |
| P7a2a-N4 | 在 `pages/` 寫 `canBool(` | `check:frontend` 擋下 |

---

## 8. 影響範圍與回滾

| 任務 | 動業務代碼 | 動資料庫 | 回滾 |
|---|---|---|---|
| T1 `utils/cart.js` + 測試 | ❌ 新增 | ❌ | `git revert` |
| T2 fake API 擴充 | ❌ 新增 | ❌ | `git revert` |
| T3 tabBar 5 項（M1–M2） | ✅ | ❌ | **單獨 commit** + `pre-p7a2a-tabbar` tag |
| T4 購物車頁（M3） | ✅ | ❌ | 單獨 commit + tag |
| T5 商品列表（M4） | ✅ | ❌ | 單獨 commit + tag |
| T6 商品詳情（M5） | ✅ | ❌ | 單獨 commit + tag |
| T7 結算頁（M6） | ✅ | ❌ | 單獨 commit + tag |

**整體回滾**：`git reset --hard <P7a-1 最後 commit>`。

---

## 9. 執行順序

```
T1  utils/cart.js + cartCodes.js + 測試（純函式，先寫）  → npm test → commit
T2  fake API 擴充（商品庫存/規格 + 購物車方法）          → commit
T3  tabBar 加購物車（M1–M2）                            → tag pre-p7a2a-tabbar → commit
T4  購物車頁改造（M3）                                   → tag → commit
T5  商品列表（M4）                                       → tag → commit
T6  商品詳情（M5）                                       → tag → commit
T7  結算頁（M6）                                         → tag → commit
    ── 完整驗收 + 逐 commit 稽核 ──
```

**⚠️ T3 的順序**：`app.json` 的 tabBar 加 `pages/cart/index` 時，該頁面**必須已存在**（它本來就在，✅ 無風險）。

---

## 10. 我需要主動指出的風險

| # | 風險 | 說明與對策 |
|---|---|---|
| P7a2a-R1 | **M3／M5／M6 是既有頁面改造** | 各別 commit + tag，可逐頁 revert |
| P7a2a-R2 | **購物車目前存在前端（Storage）** | P7b 若改後端需遷移邏輯。**若你要跨裝置同步，必須在 P7b 改成後端購物車**（§3.7.8 Q-D） |
| P7a2a-R3 | **本階段驗不到庫存的正確性** | fake 只能模擬；真正的原子扣減要等 P2-0 決策 + P5 |
| P7a2a-R4 | 「商品詳情不得有立即下單」無法用靜態規則檢查 | 只有人工驗收 C2 |
| P7a2a-R5 | 移除優惠券／發票區塊可能影響既有結算頁 | A7 已定這兩項下線，移除是預期行為；但需確認移除後結算流程仍完整 |

---

## 11. 待你確認

| # | 問題 | 阻塞什麼 |
|---|---|---|
| **Q-A** | 是否同意 P7a-2a 照此執行？ | 全部 |
| **Q-B** | （§3.7.8 Q-A）**商品從哪裡進入？** tabBar 只有「服務」——目前設計為從購物車的「去逛逛」與首頁的「零件」入口 | 首頁與購物車導覽 |
| **Q-C** | （§3.7.8 Q-D）**購物車存在前端還是後端？** P7a-2a 用本機 Storage；若要跨裝置同步需在 P7b 改後端 | cart 的資料來源 |

---

**⏸ 等你回覆 §11，以及 P2-0 探針結果。**

**再次提醒：P7a-2a／P7a-2b 完成後，若探針未跑，後端無法開工。前端完成 ≠ 專案可上線。**