# P7a-2a / T3.6.1 診斷報告 ＋ 修正方案（待確認）

> 產出日期：2026-10-16
> 分支：`refactor/hexagonal`（HEAD = `ced11cc`）
> **狀態：只診斷，未動任何代碼。等 §2／§3 確認。**
> 相關：`docs/P7a-2a-T3.6-計畫.md`（T3.6 的計畫）

---

## 0. 一句話結論

**Bug 2 與 Bug 3 不在分類頁，在商品詳情頁**（我實測了分類頁的資料流，價格與圖片都是對的）。
Bug 1／4 則是分類頁的加購入口（T3.6 刻意隱藏）＋ 詳情頁的假加購（改造前就是假的）。

| Bug | 真正的位置 | 性質 |
|---|---|---|
| 1. 加購沒有規格選項 | **詳情頁** | 詳情頁對 `prd-*` 查不到資料 → 規格清單是空的 |
| 2. 價錢顯示零 | **詳情頁** | 同一原因 → 價格欄位停在初始值 `0` |
| 3. 圖片與分類頁不一致 | **兩頁讀不同來源** | 分類頁讀新 API、詳情頁讀舊電商 mock |
| 4. 無法加入購物車 | 分類頁（我隱藏了）＋ 詳情頁（本來就是假的） | 兩個獨立原因 |

---

## 1. 逐項診斷（附證據）

### 1.1 Bug 2（價錢顯示零）—— **分類頁是對的，問題在詳情頁**

你要求核對的四個環節，我逐一查了，**四者一致**：

| 環節 | 實際 | 結論 |
|---|---|---|
| `components/goods-card/index.wxml` 讀哪個價格欄位 | `price="{{ goods.price }}"` | — |
| `components/price/index.js` 怎麼解讀 | `priceUnit` 預設 **`'fen'`（分）**；`format()` 把分換成整數＋小數兩段 | 傳「分」才對 |
| `utils/catalogView.js` 映射後給什麼 | `toCardModel()` → `price: item.priceCents` | ✅ 傳的是**分** |
| fake 資料的價格欄位名 | `priceCents`（2500 = ¥25.00） | ✅ 一致 |
| `pages/category/index.js` 傳什麼 | `mergeByCategory(...).map(toCardModel)` 的結果 | ✅ 一致 |

**實測輸出**（`node` 直接跑 `utils/catalogView` + 真實 fake 資料）：

```
=== 水/水管 ===
[ { id: 'svc-3', title: '水管疏通', price: 8000, thumb: '...dz-3a.png', tags: ['服務'] },
  { id: 'prd-2', title: '排水管接頭', price: 800,  thumb: '...dz-3a.png', tags: ['零件'] } ]
=== 空調/清洗 ===
[ { id: 'svc-2', title: '冷氣清洗', price: 6000, ... },
  { id: 'prd-3', title: '濾網（通用型）', price: 450, ... } ]
```

→ **分類頁的價格鏈完全正確**（8000 分 → ¥80）。

**「顯示零」出現在商品詳情頁**，證據：

| 位置 | 內容 |
|---|---|
| `pages/goods/details/index.js:77-79` | 初始 data：`selectSkuSellsPrice: 0`、`maxLinePrice: 0`、**`minSalePrice: 0`** |
| `pages/goods/details/index.wxml:19` | `<price price="{{minSalePrice}}" />` |
| `pages/goods/details/index.js:308-309` | `const { skuList, ... } = details; skuList.forEach(...)` —— **沒有防護** |
| `model/good.js:1891` `genGood(id)` | `allGoods[id % allGoods.length]`；`'prd-1' % 8` = **NaN** → `allGoods[NaN]` = `undefined` → 回傳的物件**沒有 `skuList`** |

**因果鏈**：`onLoad` 帶著 `spuId=prd-1` → `getDetail('prd-1')` → `fetchGood` 回傳缺 `skuList` 的物件
→ `skuList.forEach` **拋 TypeError** → `.then()` 中斷，`minSalePrice` **停留在初始值 0**
→ 畫面顯示 **¥0.00**。

> 亦即：**詳情頁根本沒載入成功**，顯示的是它的初始空白狀態。

### 1.2 Bug 3（圖片與分類頁不一致）—— 兩頁讀**不同來源**

| 頁面 | 圖片來源 | 結果 |
|---|---|---|
| 分類頁（新） | `services/api/_fake/data.js` 的 `thumb`（T3.6 加的） | ✅ 有圖 |
| 商品詳情頁（**舊電商頁，T6a 才改造**） | `model/good.js` 的 `primaryImage`（舊 mock） | ❌ 查不到 `prd-*` → `details` 是空的 |

`pages/goods/details/index.wxml:4` 是 `wx:if="{{details.images.length > 0}}"` ——
`details` 空 → **整個圖片區不渲染**。

> 這是 T4／T3.6 兩份計畫都**已記錄的過渡狀態**（T4 計畫 §12 R5、T3.6 計畫 §7 R2）：
> 商品詳情頁要到 **T6a** 才接上新 API。目前點進去看不到正確的商品。

### 1.3 Bug 1（加購沒有規格選項）＋ Bug 4（無法加入購物車）

**兩個獨立原因，剛好都造成「加不進購物車」：**

| 位置 | 現況 | 證據 |
|---|---|---|
| **分類頁的網格** | 我在 T3.6 **用 CSS 刻意隱藏**了加購圖示 | `pages/category/index.wxss`：`.cat-grid__list .goods-card__add-cart { display: none; }`（理由：T3.6 不含加購，且 `prd-1`／`prd-5`／`prd-6` 有兩種規格，從網格直接加會漏規格） |
| **詳情頁的加購按鈕** | 只彈 Toast，**從來沒有寫入任何購物車** | `pages/goods/details/index.js:218-226` `addCart()` → 只有 `Toast({message:'点击加入购物车' / '请选择规格'})` |
| **詳情頁的規格彈窗** | 沒有選項 | `pages/goods/details/index.wxml:117` `specList="{{details.specList \|\| []}}"` → `details` 空 → **空清單** |

→ 「加入購物車時沒有選項」＝ 詳情頁的規格彈窗是空的（1.1 的同一個根因）。

---

## 2. T3.6.1 修正方案（**待你確認**）

### 2.1 必做（分類頁側，我造成的部分）

| # | 檔案 | 改動 |
|---|---|---|
| **F1** | `pages/category/index.wxss` | **刪掉隱藏 `goods-card__add-cart` 的規則**（恢復圖示） |
| **F2** | `pages/category/index.wxml` | `goods-list` 加 `bind:addcart="onAddCart"` |
| **F3** | `pages/category/index.js` | 新增 `onAddCart()`：依商品型別／有無規格分流 |
| **F4** | `utils/catalogView.js` ＋ 測試 | 把分流規則寫成**純函式**（可測），畫面只負責執行 |

**F3 的分流規則**（依你的指示，但**服務**需要你決定，見 Q-2）：

| 情況 | 行為 |
|---|---|
| **零件、無規格** | `cartRules.addItem()` 寫入本機購物車 → Toast「已加入購物車」 |
| **零件、有規格** | ⚠️ Toast「此商品有多種規格，請至商品詳情選擇」（**T6a 完成後改為導向詳情頁**） |
| **服務**（`itemType === 'service'`） | ⚠️ 依 §3.7.2 **服務永遠不進購物車** → Toast「服務請直接下單」 |

> ⚠️ **「有規格 → 導向詳情頁」在 T6a 之前做不到**：詳情頁目前對 `prd-*` 是壞的
> （§1.1），導過去只會看到 ¥0.00 的空白頁。所以我建議 T3.6.1 **先只 Toast**，
> 等 T6a 把詳情頁接上新 API 再改成導向（一行的事）。

### 2.2 ⚠️ 需要你決定的一個技術限制（Q-2）

**加購圖示是 `goods-card` 內部無條件渲染的，無法依「這一張卡片是服務還是零件」隱藏。**

| 選項 | 做法 | 代價 |
|---|---|---|
| **(a) 建議** | 服務卡片照樣顯示圖示，點了 Toast「服務請直接下單」 | 圖示一致，但服務卡片上有一個「按了不會加購」的按鈕 |
| (b) | 改 `goods-list` ＋ `goods-card` 支援 `hideAddCart` | 動兩個**共用**元件（home／goods-list／coupon／promotion 都在用）→ 風險擴散 |
| (c) | 分類頁自己畫卡片（不用共用元件） | 與你指定的「同一個卡片元件」相違 |

### 2.3 建議一併做（可選，需你同意動詳情頁）

| # | 檔案 | 改動 | 理由 |
|---|---|---|---|
| **F5** | `pages/goods/details/index.js` | `getDetail()` 加防護：`skuList` 不存在時顯示「商品資料載入失敗」而不是拋 TypeError | 目前是**未捕捉的 TypeError**，在任何找不到的 id 上都會發生。1–3 行。⚠️ 這是 **T6a 的檔案**，要你同意才動 |

> **F5 不會讓詳情頁變好**（它仍沒有 `prd-*` 的資料），只是**不再拋錯**、
> 給使用者一個看得懂的訊息。真正的修復是 T6a。

### 2.4 明確不在 T3.6.1

| 項目 | 屬於 |
|---|---|
| 詳情頁接新 API、正確顯示圖片與價格 | **T6a** |
| 詳情頁的加入購物車（含規格選擇） | **T6a** |
| 「有規格 → 導向詳情頁」改成真的能用 | **T6a**（T3.6.1 先 Toast） |

---

## 3. 新需求（客服詢問／收藏）—— 提案與**必須先講清楚的五件事**

### 3.1 ⚠️ **P7a 階段沒有資料庫，寫不進 `inquiries` 集合**

你的需求寫「點發送 → **寫入 `inquiries` 集合**」。但：

| 事實 | 依據 |
|---|---|
| 資料庫集合是 **P2** 才建 | `docs/02` 執行順序；目前零雲函數、零集合 |
| 目前整個系統跑的是 `services/api/_fake/data.js` 的假資料 | `docs/SESSION-HANDOFF` §2 |

**所以在 P7a／T6b 只能二選一**（我建議 (b)，與購物車一致）：

| 選項 | 做法 | P7b 的遷移 |
|---|---|---|
| (a) fake API | 存在記憶體，**重整就消失** | 換實作 |
| **(b) 建議** | 寫本機 Storage（`utils/inquiry.js`／`utils/favorite.js`），**schema 對齊後端** | 只需換讀寫來源（購物車已用同一策略） |

### 3.2 ⚠️ `customer_id` **不得由前端決定**

「收藏與客戶 openid 綁定」→ 前端**只傳 `product_id`**，
`customer_id` 一律由後端用 `cloud.getWXContext().OPENID` 查出來
（`docs/01` §4.8.1）。前端若自己傳 `customer_id`，就可以冒充別人。
P7a 的 fake 階段則由 `getMyRole()` 的角色假身分代替。

### 3.3 ⚠️ `favorites.product_snapshot` 是「加入當時」的快照

與購物車的「加入時價格」同一個設計（`docs/01` §3.7.6 第 3 點）：
收藏之後後台改價／改名，收藏列表顯示的還是**舊值**。

建議明確寫進文件並決定 UX：**顯示快照 ＋ 標示「現價已變動」**（沿用購物車已做好的那套）。
若你要的是「永遠顯示最新價」，那 `product_snapshot` 就只該存 `name`／`image`，價格改讀現況 —— 這是兩種不同設計，**需要你選**（Q-4）。

### 3.4 `inquiries` 與既有工單的關係（需要寫清楚）

| 集合 | 掛在什麼上 | 時機 |
|---|---|---|
| `work_order_tickets` | **`order_id`（唯一）** | 下單**後** |
| **`inquiries`**（新） | **`product_id`** | 下單**前**（還不是訂單） |

→ 兩者**不能合併**（工單的唯一索引是 `order_id`，詢問沒有訂單）✓ **你的設計是對的**。
但要補三件事：

1. **`replies[]` 的元素形狀你沒寫**。建議：`{ actor_id, actor_role, body, created_at }`
2. **P5 的 Use Case 清單要加**（`docs/01` §4 目前完全沒有詢問相關的 Use Case）：
   `customer-api` → `CreateInquiry`／`QueryMyInquiries`；
   `cs-api` → `QueryInquiries`／`ReplyInquiry`／`CloseInquiry`
3. **「客服端收到詢問」屬於 P5＋P8 的範圍**（客服端 UI 是 P7a-2b／P8）——
   T6b 在 P7a 階段只能做到「寫入（本機）＋ 給客服端的資料形狀」，
   **真實的「客服看得到」要等 P5**。這點必須先講明，否則 T6b「完成」是假的。

### 3.5 「我的」頁的入口沒有排進任何任務

收藏清單、我的詢問 → 入口應該在「我的」（`pages/usercenter`）。
目前 **T6a／T6b 都沒有包含它**，P7a-2b 也沒有 → 需要指定掛在哪個任務（Q-5）。

---

## 4. T6 範圍調整（提案）

你指定：T6 → **T6a**（詳情 + 加購 + 收藏）＋ **T6b**（客服詢問 + 客服端收到）。

⚠️ **一處要澄清**：`docs/02-實施計畫.md` **沒有 T5/T6 這種編號**（`grep` 確認）——
T5/T6/T7 是 **`docs/P7a-2a-計畫.md`** 裡的任務編號。
所以「寫進 docs/02 的 T6 範圍」我會寫進 **`docs/P7a-2a-計畫.md`**（與 `docs/01` §7.1）。
若你指的是別的檔案請告訴我（Q-6）。

**調整後的執行順序**（依你指定）：

```
T3.6.1（修 4 個 bug）
  → 你執行 T4 驗收 C1–C13、T3.6 驗收 C1–C7
  → T5（商品列表）
  → T6a（詳情 + 加購 + 收藏）      ← 這裡才會真正修好 Bug 2/3 的根源
  → T6b（客服詢問流程）
  → T7（結算）
```

---

## 5. 待你確認（✅ 已於 2026-10-16 回覆）

| # | 問題 | 決議 |
|---|---|---|
| **Q-1** | §2.1 的分流規則 | ✅ 同意（**有規格零件：T6a 之前只 Toast**，不導向壞掉的詳情頁） |
| **Q-2** | 服務卡片的加購圖示 | ✅ **(a)** 照樣顯示，點擊 Toast「服務請直接下單，無需加入購物車」。（理由：b 影響 home／coupon／promotion 共用元件；c 違反「同一個卡片元件」） |
| **Q-3** | 順手修詳情頁 TypeError | ✅ 同意（真實 bug，不修永遠白屏） |
| **Q-4** | 收藏的 `product_snapshot` 價格 | ✅ **存快照價格，顯示舊價 + 提示現價**（與購物車的 `addedPriceCents` 同一設計）。例：收藏時 ¥80、漲到 ¥100 → 顯示「¥80（已漲至 ¥100）」 |
| **Q-5** | 收藏／詢問清單入口 | ✅ 排進 **T6b**：「我的」→「我的收藏」／「我的詢問」 |
| **Q-6** | 「docs/02 的 T6 範圍」 | ✅ 是 `docs/P7a-2a-計畫.md`（docs/02 沒有 T5/T6 編號） |
| **Q-7** | T6b 的客服端限制 | ✅ 可接受。`docs/P7a-2a-計畫.md` 的 T6b 要明寫：「**T6b 只做客戶端 UI 與本機寫入。客服端收到／查看／回覆需 P5 完成後才可用。**」 |

### 5.1 補充決議

| 主題 | 決議 |
|---|---|
| **`customer_id`** | **不得由前端決定**。T6b 的 Storage 版用 **openid 佔位符**（本機讀不到真實 openid），**P5 改為後端用 `OPENID` 查**。文件要標明「這是 P7a 的臨時方案，P5 必須改」 |
| **`inquiries` 與 `work_order_tickets`** | ✅ **不合併**（用途不同：前者掛 `product_id`、下單前；後者掛 `order_id`、下單後） |
| **`replies[]` 形狀** | 補 `{ actor_id, actor_role, body, created_at }` |
| **P5 的 Use Case** | 補 5 支：`CreateInquiry`、`ReplyInquiry`、`CloseInquiry`、`ListMyInquiries`、`ListPendingInquiries` |
| **診斷補充** | 使用者確認根因在 `model/good.js:1891` 的 `allGoods[id % allGoods.length]`（`'prd-1' % 8` = NaN） |

---

## 6. 執行（T3.6.1）

依 §5 的決議執行，內容見 commit：F1–F4（分類頁加購）＋ F5（詳情頁容錯）。
