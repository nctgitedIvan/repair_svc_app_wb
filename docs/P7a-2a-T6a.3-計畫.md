# P7a-2a / T6a.3 逐檔計畫 —— 資料模型升級（specs／skus／images）＋ UI 對齊

> 產出日期：2026-10-17
> 分支：`refactor/hexagonal`（HEAD = `34f1b44`，T6a.2 已 push）
> **狀態：✅ 已完成（2026-10-17）。A1／A2／B／C／D 全部交付。**
> 依據：`docs/01` §7.4（資料模型）、§7.4.5（camelCase ↔ snake_case）、T6a.2 診斷報告
> 前置決策：使用者 2026-10-17 批准的六問（見 §5）

---

## 1. 最終資料形狀（**fake 用 camelCase**，依 §7.4.5）

```js
// 商品（有規格）—— prd-1
{
  productId: 'prd-1', name: '冷媒 R410', nameEn: 'Refrigerant R410',
  description: '適用 R410A 系統…',
  detailHtml: '<p>…</p>',
  images: ['…/dz-2a.png', '…/dz-2b.png'],   // images[0] = 主圖（取代 thumb）
  category: '空調', categoryId: 'cat_ac_repair', order: 1,
  priceCents: 2500,                          // 有規格時＝**展示起價**
  stock: 20,                                 // 有規格時**不使用**
  specs: [{ specId: 'size', title: '規格', values: ['標準罐', '大罐'] }],
  skus: [
    { skuId: 'sku-std', specValues: ['標準罐'], priceCents: 2500, stock: 20, image: '…' },
    { skuId: 'sku-big', specValues: ['大罐'],   priceCents: 4800, stock: 8,  image: '…' },
  ],
  isActive: true,
}
// 無規格：specs: []、skus: []，讀 priceCents / stock
```

**`specValues` 的順序必須與 `specs` 的順序一致**（`findSkuBySelection` 依索引比對）。

---

## 2. 逐檔計畫

### 修改（M）

| # | 檔案 | 改動 |
|---|---|---|
| M1 | `services/api/_fake/data.js` | 加 `nameEn`／`detailHtml`／`images`；`specs` 改維度；新增 `skus`；圖片改 `dz-*`（**A1 先保留 `thumb`**，A2 移除） |
| M2 | `utils/detailView.js` | `buildDetailView`：`images` ← `item.images`、`hasSpecs` ← `specs.length > 0`、有規格時 `maxBuyQuantity` ＝ SKU 最大庫存；`toSpecPopupModel` 改**直接映射**；新增 `findSkuBySelection`／`stockOfSku`；`selectedSpecIdOf` 標 `@deprecated`（B 之後移除） |
| M3 | `utils/catalogView.js` | `toCardModel`：`thumb` ← `images[0]`；`specCount` 語意＝**維度數** |
| M4 | `utils/cartView.js` | `toLine`：`thumb` ← `product.images[0]`（取不到給 `''`） |
| M5 | `utils/cart.js` | `STORAGE_KEY` 升版 `repair.cart.v1` → **`repair.cart.v2`** |
| M6 | `pages/goods/details/index.js` | 選規格 → `findSkuBySelection` 取 **skuId**；選規格時即時更新數量上限為該 SKU 庫存 |
| M7 | `pages/goods/details/index.wxml` | 詳情介紹 → `<rich-text nodes="{{detail.detailHtml}}">`（空則隱藏） |
| M8 | `pages/goods/details/index.wxss` | rich-text 容器樣式；間距微調（價格/標籤、名稱/分享、已選規格） |
| M9 | `.../buy-bar/index.wxss` | 兩顆按鈕**各自全圓角＋間距**；236rpx（2×236+12＝484＋左側 220＝704 ≤ 718） |

### 新增（N）

| # | 路徑 | 職責 |
|---|---|---|
| N1 | `tests/unit/frontend/detailView.test.js`（改寫） | 直接映射、`findSkuBySelection`（單／多維度、未選完、無匹配）、`stockOfSku`、上限 |
| N2 | `tests/unit/frontend/catalogView.test.js`（微調） | `specCount` 語意、`thumb` ← `images[0]` |
| N3 | `tests/unit/frontend/apiContract.test.js`（微調） | `thumb` → `images`、`specs` 形狀 |
| N4 | `docs/P7a-2a-T6a.3-計畫.md` | 本文件 |

---

## 3. Commit 切分（每個都是安全點）

| # | commit | 內容 | 理由 |
|---|---|---|---|
| **A1** | T6a.3-1 | M1（**保留 `thumb`**）＋ M2 ＋ N1 ＋ N2/N3 | 資料與 `detailView` **必須同一 commit**（舊合成器讀新形狀會壞）；`thumb` 先留著，避免 M3/M4 未改時掉圖 |
| **A2** | T6a.3-2 | M3 ＋ M4 ＋ **移除 `thumb`** ＋ 契約測試 | 三個讀取點一起切換；切完 `grep thumb` 應為 0 |
| **B** | T6a.3-3 | M6 ＋ M7 ＋ M5 | SKU 行為與購物車 key 升版是一組（舊 lineId 會失效） |
| **C** | T6a.3-4 | M9 ＋ M8 | 純樣式，可獨立回滾 |
| **D** | T6a.3-5 | 文件（handoff §3.3 的二級分類、§4、§6、§7.4.7；T4 種子片段改 v2） | — |

---

## 4. 驗收

### 自動
| # | 項目 | 預期 |
|---|---|---|
| 1 | `npm run verify` | 每個 commit 都全綠 |
| 2 | 新結構測試 | 直接映射、SKU 查找、庫存上限 |
| 3 | `grep -rn "\.thumb\b" utils/ pages/ services/api` | **A2 之後 0 筆** |
| 4 | 既有測試 | 除刻意改寫的 spec 斷言外不紅 |

### 人工
| # | 項目 |
|---|---|
| C1 | 詳情頁主圖是 `dz-*` 佔位（不再是女裝）、不可左右滑 |
| C2 | `prd-1` 選「大罐」→ 價 4800、上限 8；加入購物車 → 購物車顯示「大罐」、單價 4800 |
| C3 | `prd-2`（無規格）直接加入、單價 800 |
| C4 | 詳情介紹標題靠左、rich-text 正常（粗體／列表）、空值隱藏 |
| C5 | 價格靠左／標籤靠右；名稱靠左／分享靠右；已選規格靠左＋箭頭 |
| C6 | buy-bar：客服／收藏（左）、加入購物車（淺紅）／立即購買（紅）各自全圓角＋間距 |
| C7 | 無橫向溢出（T6a.2 的收斂不被破壞） |

---

## 5. 已確認的六問

| # | 決議 |
|---|---|
| Q-1 | fake／視圖層用 **camelCase**（`priceCents`），DB 用 snake_case 由 adapter 轉換 |
| Q-2 | `prd-1` SKU 價差：標準罐 2500／20、大罐 4800／8 |
| Q-3 | 購物車 Storage 升 **`repair.cart.v2`**（舊資料拋棄） |
| Q-4 | `thumb` 在 A2 之後**完全移除** |
| Q-5 | 佔位圖用 `dz-*` |
| Q-6 | 本計畫存檔並 commit |

---

## 6. 風險

| # | 風險 | 對策 |
|---|---|---|
| R1 | 舊本機購物車 lineId（`prd-1:std`）與新 skuId 不相容 | Storage 升 v2；T4 種子片段一併更新 |
| R2 | 形狀變動使 T4/T6a 行為重跑 | A1/A2 各自綠燈；C2/C3 覆蓋加購主路徑 |
| R3 | `rich-text` 的 HTML 由後台提供 | **P5／P8 必須在後端清洗 HTML**（見 §7.4.3 新增條文） |
| R4 | 多維度規格（fake 目前單維度） | `findSkuBySelection` 依維度順序比對，測試覆蓋 N 維 |
| R5 | `dz-*` 只有 9 張佔位圖 | 輪替使用；真實圖片由 P8 上傳雲存儲 |
| R6 | A1 與 B 之間，詳情頁的「加入購物車」仍用舊語意（規格值而非 skuId） | `selectedSpecIdOf` 暫時泛化為「取第一個維度的已選值」，B 之後由 `findSkuBySelection` 取代並移除 |

---

## 7. 執行結果（2026-10-17）

| 階段 | commit | 結果 |
|---|---|---|
| **A1** | `ac62314` | fake 新形狀（`specs` 維度／`skus`／`images`／`nameEn`／`detailHtml`）＋ `detailView` 直接映射 |
| **A2** | `3097b00` | 移除資料模型中的 `thumb`；`catalogView`／`cartView` 改讀 `images[0]` |
| **B** | `0c5a087` | 選中 SKU 收斂數量上限；加購改存 `skuId`；購物車 `repair.cart.v2`；rich-text；移除 `selectedSpecIdOf` |
| **C** | `e689a9e` | buy-bar 雙按鈕全圓角＋間距；rich-text 容器與間距微調 |
| **D** | 本次收尾 | 文件收斂（§3.8／§7.4.7／handoff／T4 種子）；服務底部改「客服＋立即預約」；修正 `favorite.toSnapshot` 的 `thumb` 遺漏 |

**自動驗證**：每個 commit 後 `npm run verify` 皆為 exit 0；最終測試 **1084**（新增 favorite 的 `images[0]` 測試）。
人工驗收 C1–C7 由使用者執行。
