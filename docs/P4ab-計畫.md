# P4a + P4b 逐檔計畫（待你確認）

> 產出日期：2026-10-16
> 分支：`refactor/hexagonal`（`p1-done` 之後）
> 前置：`docs/P4-計畫.md`（整體）、`docs/01-目標架構.md` §3
> **狀態：計畫。未動任何代碼。**
> **本次交付：P4a（值物件與錯誤型別）+ P4b（Order 聚合、狀態機、定價）。P4c 另行確認。**

---

## 0. 紅線

| # | 紅線 | 承諾 |
|---|---|---|
| 1 | 不動業務代碼 | `pages/`、`components/`、`model/`、`services/`、`app.json` **完全不碰** |
| 2 | 不動資料庫 | **完全不碰**（P4a/P4b 是純邏輯，零 I/O） |
| 3 | 不建 P2 以外的雲函數 | **不建任何雲函數** |
| 4 | **`checkAdapterRoleBranching` 等既有規則持續生效** | 每步驟跑 `npm run verify` |

---

## 1. 沿用 P1 的稽核方法

你在 P1 要求「出逐檔計畫時先用機械化方法稽核」。P4a/P4b 尚無 commit 可稽核，但**我會沿用同樣的方法於執行後**：

> 每個 commit 完成後，逐一 `git checkout` 並實測 `check-layering` 與 `sync:check`，
> 確認**沒有任何紅色的中間狀態**（P1 只有 T3 紅，且已事先標明）。

計畫中的**已知順序風險**（先講，不重蹈 P1-T3）：

| 風險 | 說明 | 對策 |
|---|---|---|
| **P4a 的 M1（Money 加 currency）會讓既有測試短暫失敗** | `computeProfitShare.test.js` 用的是無幣別的 `Money` | M1 **單獨 commit**，並在**同一個 commit 內**同步修正受影響的測試 |
| **P4b 的 M7（OrderStatus 加 VOIDED）會讓狀態機測試的「不漏狀態」斷言失敗** | 既有測試斷言每個狀態都有 `TRANSITIONS` 條目 | 新增 `TRANSITIONS.VOIDED = []` **與** M7 同一個 commit |
| **P4b 的 M8/M9/M10 三者必須同步** | Port 契約、in-memory 實作、Use Case 三者互相依賴 | **合併為同一個 commit**，不拆 |

---

## 2. P4a 既有檔案修改（6 檔）

| # | 檔案 | 改動摘要 | 風險 |
|---|---|---|---|
| M1 | `packages/shared-kernel/Money.js` | 加 `currency`（預設 `'CNY'`）；`add`/`subtract` **檢查幣別相同**，否則拋 `InvariantViolation`；`equals` 納入幣別；`toYuanString()` 不變 | **中**（P0 核心值物件） |
| M2 | `packages/shared-kernel/Errors.js` | 新增 `SoDViolationError`、`PeriodClosedError`、`ReconciliationMismatchError`、`ApprovalRequiredError` | 低 |
| M3 | `packages/shared-kernel/index.js` | 匯出上述新錯誤型別 | 低 |
| M4 | `packages/domain/index.js` | 匯出 P4a 的新值物件 | 低 |
| M5 | `tests/unit/domain/money.test.js` | 補幣別案例；**既有斷言全部保留** | 低 |
| M6 | `package.json` | 新增 `test:shared` script | 低 |

### 2.1 M1 的設計細節（最需要小心的一項）

```js
// 現行
Money.fromCents(10000)                 // → 10000 分

// 改後（向後相容）
Money.fromCents(10000)                 // → 10000 分，currency = 'CNY'
Money.fromCents(10000, 'USD')          // → 明確指定

// 新增的保護
Money.fromCents(100, 'CNY').add(Money.fromCents(100, 'USD'))
// → 拋 InvariantViolation：幣別不符
```

**向後相容**：既有呼叫端（`ComputeProfitShareUseCase`、`InMemoryOrderRepository`）**不需修改**即可運作，因為預設幣別是 `'CNY'`。

> **這是刻意的**：M1 力求「加了保護，但不破壞既有行為」。若既有測試因此失敗，代表我改壞了，不是測試該改。

---

## 3. P4a 新增檔案（14 檔）

### 3.1 值物件基礎（3 檔）

| # | 路徑 | 職責 |
|---|---|---|
| N1 | `packages/domain/shared/ValueObject.js` | 值物件基底：`Object.freeze`、`equals()` 契約、`toString()` |
| N2 | `packages/domain/shared/canonicalJSON.js` | **確定性序列化**：鍵依字典序、無多餘空白、數字不轉字串。**哈希鏈的基礎** |
| N3 | `packages/domain/shared/assertions.js` | `invariant(cond, message)`、`assertNonEmptyString()` 等 |

> `canonicalJSON` 為什麼重要：同一筆資料若在不同 JS 引擎算出不同字串，**哈希鏈就會誤報斷點**。
> 必須有專門的測試證明其穩定性（鍵順序無關、巢狀一致）。

### 3.2 領域值物件（6 檔）

| # | 路徑 | 職責 | 關鍵不變式 |
|---|---|---|---|
| N4 | `packages/domain/shared/MaskedPhone.js` | 脫敏手機號 | **型別上無法持有完整號碼**；`MaskedPhone.of('13812345678')` → `138****1234`；再 `of()` 一次不會二次遮罩 |
| N5 | `packages/domain/shared/AddressView.js` | 分級後的地址 | **沒有 `detailAddress` 欄位**；`level` 只能是 `DISTRICT` / `FULL` |
| N6 | `packages/domain/shared/Address.js` | 完整地址 | `district` 級摘要方法 `toDistrictView()` |
| N7 | `packages/domain/shared/OrderNo.js` | 訂單號 | 格式校驗 |
| N8 | `packages/domain/shared/CommissionRate.js` | 分潤比例 | basis point 整數，`0 ≤ bp ≤ 10000` |
| N9 | `packages/domain/audit/AmountChangeReason.js` | 金額變更原因列舉 | 凍結的列舉；未知值拋錯 |

### 3.3 分潤條款（1 檔）

| # | 路徑 | 職責 |
|---|---|---|
| N10 | `packages/domain/settlement/ProfitSharingTerms.js` | 下單當下凍結的條款：`base`（`SERVICE_FEE` / `SERVICE_FEE_PLUS_MATERIAL`）、`technicianRateBp`、`platformRateBp`、`roundingMode`、`termsVersion`。**不可變** |

### 3.4 測試（4 檔）

| # | 路徑 | 重點 |
|---|---|---|
| N11 | `tests/unit/shared-kernel/moneyCurrency.test.js` | 不同幣別運算必拋錯；同幣別正常；**預設幣別不破壞既有行為** |
| N12 | `tests/unit/domain/shared/valueObjects.test.js` | 值物件不可變、`equals` 契約 |
| N13 | `tests/unit/domain/shared/canonicalJSON.test.js` | **鍵順序無關**、巢狀一致、數字不變字串 |
| N14 | `tests/unit/domain/shared/maskedPhone.test.js` | 遮罩正確、**無法取得完整號碼**、重複遮罩不疊加 |

---

## 4. P4b 既有檔案修改（7 檔）

| # | 檔案 | 改動摘要 | 風險 |
|---|---|---|---|
| M7 | `packages/domain/order/OrderStatus.js` | 新增 `VOIDED`（值 92，終態）；`TRANSITIONS` 加 `VOIDED: []` 及**所有非終態 → `VOIDED` 的邊** | **中**（核心狀態機） |
| M8 | `packages/ports/OrderRepository.js` | 契約改為對齊 `Order` 聚合（不再是 P0 的佔位形狀） | **中** |
| M9 | `packages/adapters/inmemory/InMemoryOrderRepository.js` | 對齊聚合 | 中 |
| M10 | `packages/application/settlement/ComputeProfitShareUseCase.js` | 對齊聚合；改用 `ProfitSharingPolicy`（P4c 才建，此處先內聯，P4c 抽出） | 中 |
| M11 | `tests/unit/domain/orderStatus.test.js` | 補 `VOIDED` 的斷言（唯一性、終態、轉移） | 低 |
| M12 | `tests/unit/application/computeProfitShare.test.js` | 對齊新聚合形狀 | 低 |
| M13 | `packages/domain/index.js` | 匯出 Order 聚合 | 低 |

> **M7、M8、M9、M10 建議合併為一個 commit**：Port 契約、in-memory 實作、Use Case 三者互相依賴，
> 拆開會產生紅色的中間狀態（正是 P1-T3 的教訓）。

### 4.1 M7 的轉移規則設計

```js
// VOIDED 可由「任何非終態」進入
PENDING_PAYMENT        → VOIDED
PAID_PENDING_ASSIGN    → VOIDED
ASSIGNED_PENDING_ACCEPT→ VOIDED
ACCEPTED_PENDING_VISIT → VOIDED
IN_SERVICE             → VOIDED
PENDING_ACCEPTANCE     → VOIDED
DISPUTED               → VOIDED
COMPLETED              → VOIDED      ← 見下方說明

// VOIDED 是終態
VOIDED                 → （無出口）
```

> **⚠️ 關於「已付款／已完成能否作廢」** —— `docs/P4-計畫.md` §9.2 **Q1-b 尚未回覆**。
>
> **我的處理方式（刻意讓它不受此問題阻塞）**：
> - **狀態機只回答「這個轉移合不合法」**，允許所有非終態 → `VOIDED`
> - **「已付款作廢必須先退款」是業務規則，屬於 Use Case 與 `AccessPolicy`，不屬於狀態機**
>
> 因此 Q1-b 未定**不會阻塞 P4b**。它會在 P5（`VoidOrderUseCase`）與 P4c（`ApprovalPolicy`）才需要答案。
> 這樣的分工是刻意的：狀態機管合法性，業務規則管適當性。

---

## 5. P4b 新增檔案（9 檔）

| # | 路徑 | 職責 |
|---|---|---|
| N15 | `packages/domain/order/Order.js` | **聚合根**。`items`、`amounts`、`status`、`snapshot`、`timeline`、`version`；所有狀態變更方法皆經狀態機驗證 |
| N16 | `packages/domain/order/OrderItem.js` | 聚合內實體。含**價格快照**（`nameSnapshot`、`unitPriceSnapshot`、`commissionRateBpSnapshot`） |
| N17 | `packages/domain/order/OrderStateMachine.js` | 唯一定義「誰能在什麼狀態做什麼轉移」。**actor 的角色 → 允許的目標狀態** |
| N18 | `packages/domain/order/OrderStatusLog.js` | 狀態流轉紀錄（`from`、`to`、`actor`、`at`、`reason`） |
| N19 | `packages/domain/order/PricingService.js` | 由 `items` 計算 `serviceFee` / `materialFee` / `total`。**純函式** |
| N20 | `packages/domain/order/OrderSnapshot.js` | 下單當下凍結的 `ProfitSharingTerms` + `pricingVersion` |
| N21 | `tests/unit/domain/order/order.test.js` | 聚合不變式、快照不可變、樂觀鎖版本、`void()` |
| N22 | `tests/unit/domain/order/stateMachine.test.js` | **全部合法與非法轉移**，含 `VOIDED` |
| N23 | `tests/unit/domain/order/pricing.test.js` | 服務費／材料費／總額；取整不漏錢；空 items |

### 5.1 `Order` 聚合的方法介面（P4b 的契約）

```js
Order.rehydrate(props)          // 從持久化還原
Order.create(props)             // 建立新訂單

order.assignTo(technicianId, { at, by, remark })
order.accept({ at, by })
order.reject({ at, by, reason })
order.reportArrival({ at, by })
order.completeService({ at, by })
order.confirmCompletion({ at, by })
order.raiseDispute({ at, by, reason })
order.resolveDispute({ outcome, at, by })
order.voidOrder({ reasonCode, reason, at, by })    // ← 新增
order.cancel({ reasonCode, at, by })

order.toSnapshot()              // 供稽核的 before/after
order.stateMachine()            // 回傳狀態機查詢器
```

**每個方法都必須**：
1. 先問狀態機「這個轉移合不合法」
2. 不合法 → **拋 `IllegalStateTransition`**（程式錯誤，不是業務失敗）
3. 合法 → 附加 `OrderStatusLog` 到 `timeline`，遞增 `version`

---

## 6. npm script 變更

| script | 動作 |
|---|---|
| `test:shared` | **新增**：`node --test "tests/unit/shared-kernel/**/*.test.js"` |
| 其餘 | 不變；**不動任何依賴** |

---

## 7. 驗收標準（逐項可驗證）

### 7.1 自動化

| # | 驗收項 | 指令 | 預期 |
|---|---|---|---|
| P4ab-A1 | 依賴方向 | `node scripts/check-layering.js` | `exit=0` |
| P4ab-A2 | **domain 零外部依賴** | `grep -rE "wx-server-sdk\|wx\.cloud\|Date\.now\(\|Math\.random\(\|process\.env\|console\." packages/domain/` | **0 筆** |
| P4ab-A3 | 全部測試 | `npm test` | `fail 0`，總數 **≥ 300**（P1 為 229） |
| P4ab-A4 | **domain 測試離線且毫秒級** | `npm run test:domain` | `fail 0`，**< 1 秒** |
| P4ab-A5 | 幣別保護 | `npm run test:shared` | 不同幣別相加**必拋錯** |
| P4ab-A6 | **Money 向後相容** | `npm test`（既有 229 測試） | **一個都不能紅** |
| P4ab-A7 | canonicalJSON 穩定性 | `node --test "tests/unit/domain/shared/canonicalJSON.test.js"` | 鍵順序無關 |
| P4ab-A8 | MaskedPhone 不可逆 | 同上 maskedPhone | **無任何方法可取回完整號碼** |
| P4ab-A9 | 狀態機完整 | 同上 stateMachine | 合法與**非法**轉移皆覆蓋，含 `VOIDED` |
| P4ab-A10 | 狀態數值唯一（回歸） | 同上 orderStatus | 含 `VOIDED`=92，全體不重複 |
| P4ab-A11 | 定價不漏錢 | 同上 pricing | 明細和 == 總額 |
| P4ab-A12 | `npm run verify` | — | 全綠 |

### 7.2 靜態

| # | 驗收項 | 指令 | 預期 |
|---|---|---|---|
| P4ab-B1 | 業務代碼零改動 | `git diff --stat p1-done -- pages/ components/ model/ services/ app.json` | **空** |
| P4ab-B2 | 資料庫零改動 | `grep -rn "db\.collection\|wx\.cloud\.database" packages/` | **0 筆** |
| P4ab-B3 | 未建雲函數 | `ls cloudfunctions/` | 與 P1 **相同**（5 支，不增不減） |
| P4ab-B4 | 依賴未變 | `git diff p1-done -- package.json` 的依賴區塊 | **空** |

### 7.3 負向測試（沿用 P0/P1 方法）

| # | 故意違反 | 預期 |
|---|---|---|
| P4ab-N1 | `domain/` 內寫 `Date.now()` | `check-layering` 擋下 |
| P4ab-N2 | 不同幣別的 `Money` 相加 | 拋 `InvariantViolation` |
| P4ab-N3 | 從 `VOIDED` 再轉移 | 拋 `IllegalStateTransition` |
| P4ab-N4 | `PENDING_PAYMENT` 直接跳 `COMPLETED` | 拋 `IllegalStateTransition` |
| P4ab-N5 | 修改已凍結的 `OrderSnapshot` | 拋錯（物件已 `freeze`） |
| P4ab-N6 | `MaskedPhone` 試圖取回完整號碼 | 無此 API（**型別層面不可能**） |

---

## 8. 影響範圍與回滾

| 子階段 | 動業務代碼？ | 動資料庫？ | 動 P0/P1 產物 | 回滾 |
|---|---|---|---|---|
| P4a | ❌ | ❌ | ✅ M1–M5 | `git revert`（**M1 單獨 commit**） |
| P4b | ❌ | ❌ | ✅ M7–M13 | `git revert`（**M7–M10 合併 commit**） |

**整體回滾**：`git reset --hard p1-done`。
**P4a/P4b 沒有任何不可逆操作** —— 純程式碼、零 I/O、零雲端資源。

---

## 9. 執行順序

```
T1  M1 Money 加 currency                    → npm test（既有 229 必須全綠）→ commit
T2  M2/M3 新錯誤型別                        → npm run verify → commit
T3  N1–N3 值物件基礎（ValueObject/canonicalJSON/assertions）→ commit
T4  N4–N10 值物件                            → npm run verify → commit
T5  N11–N14 測試 + M6 script                 → npm test → commit
    ── P4a 完成，跑完整驗收 + 逐 commit 稽核 ──
T6  M7 OrderStatus 加 VOIDED + M11 測試      → npm test → commit
T7  N15–N20 Order 聚合與狀態機               → npm test → commit
T8  M8/M9/M10/M12 對齊聚合（合併一個 commit）→ npm run verify → commit
T9  N21–N23 測試                             → npm test → commit
    ── P4b 完成，跑完整驗收 + 逐 commit 稽核 ──
```

**每個 T 結束都跑 `npm run verify` 並回報。** 逐 commit 稽核方法同 P1（checkout 每個 commit 實測）。

---

## 10. 我需要主動指出的風險

| # | 風險 | 說明與對策 |
|---|---|---|
| P4ab-R1 | **M1 改動 P0 核心值物件** | 力求「加保護不破壞既有行為」（預設幣別 `CNY`）。**既有 229 測試一個都不能紅** —— 這是驗收項 A6 |
| P4ab-R2 | **M7 加狀態會讓「每個狀態都有轉移條目」的既有斷言失敗** | 同 commit 加 `TRANSITIONS.VOIDED = []` |
| P4ab-R3 | **M8/M9/M10 拆開會產生紅色中間狀態**（P1-T3 的教訓） | 合併為一個 commit |
| P4ab-R4 | `ComputeProfitShareUseCase` 在 P4b 會**暫時內聯** `ProfitSharingPolicy` 的邏輯，P4c 才抽出 | 刻意的順序安排；會在程式碼註解標明 `TODO(P4c)` |
| P4ab-R5 | Q1-b（已付款能否作廢）未定 | **已設計成不阻塞**：狀態機只管合法性，業務規則留給 P5/P4c |
| P4ab-R6 | `canonicalJSON` 若寫錯，哈希鏈會誤報 | 有專門測試證明鍵順序無關；P4c 的 `AuditChain` 會再驗一次 |

---

## 11. 待你確認

| # | 問題 | 阻塞什麼 |
|---|---|---|
| **Q-A** | **是否同意 P4a + P4b 照此執行？** | 全部 |
| Q-B | `VOIDED` 的轉移規則：**允許所有非終態 → VOIDED** 是否正確？ | P4b 的 `TRANSITIONS` |
| Q-C | （同 `docs/P4-計畫.md` §9.2）已付款訂單能否直接作廢？ | **不阻塞 P4b**，但 P5 前需要答案 |

---

**⏸ 等你回覆 Q-A／Q-B，以及 P2-0 探針結果、P0 雲端驗證、P1 的 C1／C2／C3。確認後才動代碼。**
