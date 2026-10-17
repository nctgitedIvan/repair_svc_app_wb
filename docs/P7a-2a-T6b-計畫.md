# P7a-2a / T6b 逐檔計畫 —— 客服詢問流程（客戶端 UI ＋ 本機 Storage）

> 產出日期：2026-10-17
> 分支：`refactor/hexagonal`（HEAD = `1932bc6`，T5 已完成）
> **狀態：計畫。未動任何代碼。**
> 依據：`docs/01` §7.2 第 8 點（`inquiries`）、§4.1／§4.2（Use Case）、
> `docs/P7a-2a-計畫.md` §13、`docs/04-前端規範.md`

---

## 1. 現況與缺口

| # | 現況 | 缺口 |
|---|---|---|
| 1 | 詳情頁左下角「客服」只給 Toast「客服詢問功能建置中」 | 沒有詢問彈窗，也沒有寫入任何資料 |
| 2 | 「我的」只有「收货地址／我的收藏／設置」等入口 | 沒有「我的詢問」 |
| 3 | 沒有詢問的清單頁與資料模組 | 無處可查看已送出的詢問 |
| 4 | `docs/01` 已定 `inquiries` schema 與 5 支 Use Case | P7a 沒有資料庫，只能先寫本機 Storage |
| 5 | 收藏已有 `utils/favorite.js` 的成熟模式（純函式＋正規化＋本機持久化） | 詢問應沿用同一套模式 |

**P7a 的硬限制（必須在文件與 UI 文案中講清楚）**：

> **T6b 只做客戶端 UI 與本機 Storage 寫入。
> 客服端真的收到／查看／回覆需要 P5（Use Case ＋ 雲函數）完成後才可用。**

---

## 2. 範圍與決策

### 2.1 本階段做

- 詳情頁「客服」→ 詢問彈窗 → 送出 → 寫入本機 Storage。
- 「我的」→「我的詢問」清單（商品快照、訊息、時間、狀態、客服回覆預覽）。
- P5 Use Case 契約與資料映射（寫在本計畫，供 P5 實作）。

### 2.2 本階段不做

| 項目 | 原因 |
|---|---|
| 客服端接收／回覆頁面 | 需要 P5 的 `ListPendingInquiries`／`ReplyInquiry` 與角色路由；本階段只留契約，**不做佔位頁**（避免死頁面） |
| 真正的 `inquiries` 集合／雲函數 | P2／P5 才建；P7a 寫本機 Storage |
| 服務項目的詢問 | `docs/01` §7.2 第 8 點的鍵是 `product_id`；服務詢問**本階段不做**（Q-1 已確認），日後需擴充 `item_type/item_id` |
| 推播／通知 | 需要後端與訂閱訊息（P5／P6） |

---

## 3. 儲存 Schema（本機 camelCase，對齊後端 snake_case）

Storage key：**`repair.inquiries.v1`**（與 `repair.cart.v2`／`repair.favorites.v1` 同一策略）

```js
{
  items: [{
    inquiryId,            // 本機 id：inq-<timestamp>（衝突時加後綴）
    customerId,           // P7a 佔位符 '__local__'；P5 由 OPENID 決定
    productId,
    productSnapshot: {    // 詢問當下的快照（後台改價／改名不影響）
      name,
      image,              // images[0]（T6a.3 起不再有 thumb）
      priceCents,
    },
    message,              // 使用者輸入；空值時預設「我想詢問「{name}」」
    status,               // 'pending' | 'replied' | 'closed'
    createdAt,            // Unix ms
    csAgentId,            // P7a 恆為 null；P5 回覆時填入
    replies: [],          // P7a 恆為空；P5 追加 { actorId, actorRole, body, createdAt }
  }],
  updatedAt,
}
```

**對照後端 `docs/01` §7.2 第 8 點**

| 本機（camelCase） | 後端（snake_case） |
|---|---|
| `inquiryId` | `_id` |
| `customerId` | `customer_id` |
| `productId` | `product_id` |
| `productSnapshot.priceCents` | `product_snapshot.price_cents` |
| `csAgentId` | `cs_agent_id` |
| `createdAt` | `created_at` |

### 3.1 正規化規則（`normalizeStore`）

沿用 `utils/favorite.js` 的原則：**單筆壞掉不該毀掉整份**。

| 情況 | 處理 |
|---|---|
| `JSON.parse` 失敗／形狀不對 | 空資料 |
| 缺 `inquiryId`／`productId`／`productSnapshot.name` | 丟掉該筆 |
| 重複的 `inquiryId` | 只留第一筆 |
| `status` 不是三個合法值 | 視為 `pending`（不丟掉使用者資料） |
| 缺 `customerId` | 補 `__local__` |
| 缺 `replies`／不是陣列 | 給 `[]` |
| 筆數超過上限 | 只留前 **100** 筆 |

### 3.2 訊息長度

- `t-textarea` 的 `maxlength = 200`。
- 純函式再做一次 `trim` 與截斷（防止繞過 UI 寫入超長內容）。
- 空訊息 → 預設 `我想詢問「{商品名}」`。

---

## 4. 逐檔計畫

### 修改（M）

| # | 檔案 | 改動 |
|---|---|---|
| M1 | `pages/goods/details/index.js` | 「客服」改為開啟詢問彈窗（`key === 'cs'`）；新增 `onInquiryClose`／`onInquirySubmit`；送出時呼叫 `utils/inquiry.js` 寫入本機 Storage；服務項目依 Q-1 的決定處理 |
| M2 | `pages/goods/details/index.wxml` | 加入 `<inquiry-popup>`，傳 `show`／`product-name` |
| M3 | `pages/goods/details/index.json` | 註冊 `inquiry-popup` |
| M4 | `pages/usercenter/index.js` | 選單新增「我的詢問」（`type: 'inquiry'`），`onClickCell` 導向 `/pages/user/inquiries/index` |
| M5 | `app.json` | `pages/user` 子包新增 `inquiries/index` |
| M6 | `docs/SESSION-HANDOFF.md`／`docs/P7a-2a-計畫.md` | T6b 完成收尾（T6b-4） |

### 新增（N）

| # | 路徑 | 職責 |
|---|---|---|
| N1 | `utils/inquiry.js` | 純函式＋本機持久化：`toSnapshot`／`addInquiry`／`listInquiries`／`normalizeStore`／`loadInquiries`／`saveInquiries`／`toRowModel`／`formatTime` |
| N2 | `tests/unit/frontend/inquiry.test.js` | 上述純函式的測試（含快照、預設訊息、上限、正規化、排序、狀態映射） |
| N3 | `pages/goods/details/components/inquiry-popup/index.{js,wxml,wxss,json}` | 詢問彈窗（`t-popup` ＋ `t-textarea`），事件 `close`／`submit` |
| N4 | `pages/user/inquiries/index.{js,wxml,wxss,json}` | 「我的詢問」清單頁（本機 Storage、唯讀） |
| N5 | `docs/P7a-2a-T6b-計畫.md` | 本文件 |

### 刻意不動

- `pages/user/favorites/**`：收藏已完成；不複用其頁面，只沿用相同的資料模組模式。
- `utils/favorite.js`：詢問與收藏是兩個集合，不合并模組。
- 任何雲函數／資料庫／`packages/`。

---

## 5. 互動規格

### 5.1 詳情頁「客服」

```
詳情頁左下角「客服」
  → 商品：開啟詢問彈窗
  → 服務：Toast「服務詢問建置中（P5）」（Q-1 已確認）
  → 彈窗內容：
      標題：詢問商品
      說明：是否詢問該商品：{商品名}？
      輸入框（選填）：想問什麼？（最多 200 字）
      按鈕：取消／發送
  → 發送成功：關閉彈窗＋Toast「已送出詢問」
```

- 送出失敗（Storage 寫入失敗）→ Toast「送出失敗，請稍後再試」，彈窗不關。
- 重複送出允許（同一商品可以有多筆詢問）；上限 100 筆。

### 5.2 「我的詢問」

| 元素 | 內容 |
|---|---|
| 商品縮圖 | `productSnapshot.image`（沒有就不顯示） |
| 商品名 | `productSnapshot.name` |
| 訊息 | `message`（兩行截斷） |
| 客服回覆 | 有 `replies` 時顯示最後一則（P7a 的正常資料不會有） |
| 狀態 | `pending` → 待回覆；`replied` → 已回覆；`closed` → 已結束 |
| 時間 | `formatTime(createdAt)`（`YYYY-MM-DD HH:mm`） |
| 點擊 | 商品詳情 `/pages/goods/details/index?productId=...` |
| 空態 | 「還沒有詢問任何商品」＋「去逛逛零件」→ `/pages/goods/list/index` |

**排序**：`createdAt` 由新到舊。

---

## 6. P5 Use Case 契約（本階段只寫文件）

| Use Case | 輸入 | 回傳／副作用 |
|---|---|---|
| `CreateInquiry` | `{ productId, message }` | 建 `inquiries(status='pending')`；`customer_id` 由 OPENID 決定；`product_snapshot` 由後端以當下商品建立 |
| `ListMyInquiries` | `{}` | 回自己的詢問（`createdAt` 新到舊），含 `replies` |
| `ListPendingInquiries` | `{}`（客服） | `status='pending'`，依 `created_at` |
| `ReplyInquiry` | `{ inquiryId, body }`（客服） | 追加 `replies[]`；`status='replied'`；寫 audit；通知客戶 |
| `CloseInquiry` | `{ inquiryId }`（客服） | `status='closed'`；寫 audit |

**P7b 的切換點**：`utils/inquiry.js` 的 `loadInquiries`／`saveInquiries` 改呼叫
`services/api`（P5 完成後）；頁面與元件不需要改。

---

## 7. Commit 切分

| # | commit | 內容 | 驗證 |
|---|---|---|---|
| **T6b-0** | 計畫存檔 | N5 | — |
| **T6b-1** | 資料模組 | N1＋N2（純函式與 Storage 正規化） | `npm run verify` |
| **T6b-2** | 詳情頁詢問 | N3＋M1／M2／M3 | `npm run verify`；人工 C1–C3 |
| **T6b-3** | 我的詢問 | N4＋M4／M5 | `npm run verify`；人工 C4–C7 |
| **T6b-4** | 文件 | M6 | `npm run verify` |

> 每個 commit 前用 `npm run verify > verify.log 2>&1; echo $?` 檢查真實退出碼；
> 每個 commit 後回報退出碼與結果。

---

## 8. 驗收

### 8.1 自動

| # | 項目 | 預期 |
|---|---|---|
| A1 | `npm run verify` | 每個 commit exit 0 |
| A2 | `inquiry.test.js` | 快照（`images[0]`）、預設訊息、200 字截斷、上限 100、正規化、排序、狀態映射全過 |
| A3 | 既有測試 | 不因新增模組而紅 |

### 8.2 人工

| # | 操作 | 預期 |
|---|---|---|
| C1 | 商品詳情按「客服」 | 彈窗顯示「是否詢問該商品：{商品名}？」 |
| C2 | 輸入訊息→發送 | 彈窗關閉、Toast；Storage `repair.inquiries.v1` 出現一筆 `status: 'pending'` |
| C3 | 空白訊息→發送 | 仍可送出，`message` 為「我想詢問「{商品名}」」 |
| C4 | 我的 → 我的詢問 | 顯示商品縮圖、名稱、訊息、時間、待回覆 |
| C5 | 點詢問列 | 進商品詳情（`productId`） |
| C6 | 沒有任何詢問 | 空態＋「去逛逛零件」 |
| C7 | 服務詳情按「客服」 | Toast「服務詢問建置中（P5）」，不寫入任何資料 |
| C8 | 手動塞一筆 `replied`（含 replies） | 狀態顯示「已回覆」，並顯示最後一則客服回覆（驗證 P5 契約的顯示層） |
| C9 | 橫向溢出 | 無左右滑動 |

---

## 9. WXML 事件綁定核對清單

| # | WXML | 事件／屬性 | 處理函式 | 檔案 |
|---|---|---|---|---|
| 1 | `buy-bar` | `bind:toNav` | `onBuyBarNav`（既有；`key === 'cs'`） | `pages/goods/details/index.js` |
| 2 | `inquiry-popup` | `bind:close` | `onInquiryClose` | 同上 |
| 3 | `inquiry-popup` | `bind:submit` | `onInquirySubmit` | 同上 |
| 4 | 彈窗「取消」 | `bindtap` → `triggerEvent('close')` | 元件內 `handleClose` | `inquiry-popup/index.js` |
| 5 | 彈窗「發送」 | `bindtap` → `triggerEvent('submit', { message })` | 元件內 `handleSubmit` | 同上 |
| 6 | 我的 cell | `bind:click` | `onClickCell`（`type === 'inquiry'`） | `pages/usercenter/index.js` |
| 7 | 詢問列 | `bindtap` | `onRowTap` | `pages/user/inquiries/index.js` |
| 8 | 空態按鈕 | `bindtap` | `onGotoShop` | 同上 |

**元件註冊**：

- `pages/goods/details/index.json` 加 `"inquiry-popup": "./components/inquiry-popup/index"`
- `pages/user/inquiries/index.json` 加 `t-image`／`t-toast`／`price`（必要時 `t-tag`）
- `pages/usercenter/index.json` 不需要新增元件

**路由**：`app.json` 的 `pages/user` 子包加 `"inquiries/index"`。

---

## 10. 已確認的四點（2026-10-17）

| # | 問題 | 決議 |
|---|---|---|
| **Q-1** | 服務詳情頁的「客服」是否也要能詢問？ | ✅ **本階段只支援商品**。服務按「客服」給 Toast「服務詢問建置中（P5）」；日後要支援服務需擴充 `item_type/item_id`（P2／P5） |
| **Q-2** | 客服端接收頁面要不要做佔位骨架？ | ✅ **不做**。契約見 §6，P5 再實作 |
| **Q-3** | 彈窗要不要輸入訊息？ | ✅ **要（選填 textarea，最多 200 字）**；空白時用預設「我想詢問「{商品名}」」 |
| **Q-4** | 詢問清單是否允許刪除／撤回？ | ✅ **不做（唯讀）**；客戶端沒有撤回，`CloseInquiry` 是客服的 Use Case |

---

## 11. 風險

| # | 風險 | 對策 |
|---|---|---|
| R1 | 本機資料只存在單一裝置，換手機或清 Storage 就消失 | 文件明寫「P7a 臨時方案」；P7b 換後端 |
| R2 | 沒有客服回覆，使用者以為送出了卻没人理 | 詳情頁與清單頁都標「客服回覆需 P5 上線」？**UI 文案不寫內部階段名**；在 handoff／計畫中標示。上線前由文案決定 |
| R3 | `inquiryId` 碰撞 | `inq-<now>`；若已存在則加 `-1`、`-2`（純函式內處理，有測試） |
| R4 | 服務詢問需求日後追加 | schema 需擴充 `item_type/item_id`；本計畫明確標示未支援 |
| R5 | WXML 沒有編譯期檢查 | 依 §9 清單逐項核對事件與元件註冊 |

---

## 12. 回滾

| commit | 回滾方式 |
|---|---|
| T6b-1 | `git revert`（只動新增的 `utils/inquiry.js` 與測試） |
| T6b-2 | `git revert`（詳情頁與彈窗元件） |
| T6b-3 | `git revert`（我的入口、清單頁、app.json） |
| T6b-4 | `git revert`（文件） |
