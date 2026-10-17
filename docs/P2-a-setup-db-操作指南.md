# P2-a `setup-db` 操作指南（請你執行）

> 目的：一次上傳 `setup-db`，同時完成
> ① P0 雲端部署驗證 ② `@repair/*` 共享碼載入驗證 ③ 22 個集合建立。
> **請在 `repair-test` 環境執行，不要在生产环境。**
> 本函數是臨時工具，P2 驗收後刪除；**集合保留**。

---

## 0. 前置（在專案根目錄）

```bash
npm run sync
npm run verify
```

- `npm run sync` 會把 `packages/*` 複製到 `cloudfunctions/setup-db/node_modules/@repair/*`，
  並把目前的共享碼雜湊寫進 `cloudfunctions/setup-db/package.json` 的 `repairSharedHash`。
- 若 `npm run verify` 失敗，**先不要部署**，把錯誤貼回來。

---

## 1. 上傳與部署

1. 打開微信開發者工具，確認雲開發環境切到 **`repair-test`**。
2. 在檔案總管找到 `cloudfunctions/setup-db`。
3. 右鍵 → **上傳並部署**。
4. ⚠️ **必須選「上傳所有檔案」**（不是「雲端安裝依賴」）。
   - 共享碼存在於 `setup-db/node_modules/@repair/*`，只有「上傳所有檔案」才會帶上去。
   - 這一點與 `docs/SESSION-HANDOFF.md` §3.4 的部署規則一致。

---

## 2. 先用 dryRun 驗證共享碼（不建集合）

在雲開發 console → 雲函數 → `setup-db` → 測試，傳入：

```json
{ "dryRun": true }
```

預期回傳：

```json
{
  "ok": true,
  "dryRun": true,
  "p0": {
    "deployed": true,
    "sharedBuildMatches": true,
    "sharedCodeLoaded": true
  },
  "sharedBuild": {
    "hash": "…",
    "hashFromPackageJson": "…",
    "checks": {
      "manifestLoaded": true,
      "hashMatches": true,
      "sharedKernelLoaded": true,
      "resultLoaded": true
    }
  },
  "collections": { "total": 22, "created": [], "existing": [], "failed": [] },
  "indexes": [ … ]
}
```

- 若 `sharedBuildMatches` 或 `sharedCodeLoaded` 不是 `true`：
  - 重新執行 `npm run sync`
  - 重新「上傳所有檔案」
  - 再測一次
- 若 `deployed` 不是 true，代表函數沒有啟動 → 看 console 的錯誤日誌（通常是 `@repair/*` 找不到或雜湊不符）。

---

## 3. 正式建立集合

確認 dryRun 成功後，傳入空物件：

```json
{}
```

預期回傳：

```json
{
  "ok": true,
  "p0": { "deployed": true, "sharedBuildMatches": true, "sharedCodeLoaded": true },
  "collections": {
    "total": 22,
    "created": [ "users", "customers", "…" ],
    "existing": [],
    "failed": [],
    "allPresent": true
  },
  "indexes": [ … ],
  "nextSteps": [ … ]
}
```

- `existing` 有值 = 集合本來就存在（正常的冪等行為）。
- `failed` 必須是空陣列；若有失敗，把整段 JSON 貼回來。

> 再執行一次 `{}` 應該全部落在 `existing`，`failed` 仍為空 —— 這就是冪等驗收。

---

## 4. 建立索引（console 手動）

SDK **不支援建立索引**，請在雲開發 console 逐一設定。

先在本地產生清單：

```bash
node scripts/p2/print-index-checklist.js
```

清單會列出 22 個集合的所有索引、欄位與是否唯一。
**三個冪等鍵的唯一索引不能漏**：

- `payment_records.out_trade_no`
- `profit_sharing_records.out_order_no`
- `refund_records.out_refund_no`

以及：

- `users.openid`
- `customers.user_id`
- `cs_agents.user_id`
- `technicians.user_id`
- `carts.user_id`
- `favorites (customer_id, product_id)`
- `orders.order_no`
- `work_order_tickets.order_id`
- `system_configs.key`
- `id_sequences.key`

---

## 5. 設定集合權限

**22 個集合全部設為「僅管理端可讀寫」。**

- 這是「前端不可信」的物理保證（`docs/04` 紅線）。
- 請逐一核對；建議截圖或在 `docs/P2-集合與索引.md` 打勾。
- 若某個集合誤設為「所有使用者可讀寫」，P2 驗收不通過。

---

## 6. 回報格式

請把以下兩段貼回來：

1. `setup-db` 的完整回傳 JSON（`{}` 那次）。
2. 索引與權限的核對結果（可直接說「22/22 完成」或列出缺漏）。

有了這兩段，我才會繼續 **P2a-3（契約測試框架＋基礎 Port）**。

---

## 7. 清理（P2 驗收後）

P2 全部完成後：

1. 在雲開發 console 刪除 `setup-db` 雲函數。
2. 本地可保留 `cloudfunctions/setup-db/` 供審計，或依指示刪除。
3. **不要刪集合**（它們是正式資料庫結構）。
