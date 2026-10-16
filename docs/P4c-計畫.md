# P4c 逐檔計畫（待你確認）

> 產出日期：2026-10-16
> 分支：`refactor/hexagonal`（`p1-done` 之後，P4a/P4b 已完成）
> 前置：`docs/P4-計畫.md`、`docs/01-目標架構.md` §4.7、**§4.8（新增）**
> **狀態：計畫。未動任何代碼。**
> **本次交付：P4c = 策略（7 檔）+ 存取控制（12 檔）。完成後才出 P7 計畫。**

---

## 0. 紅線

| # | 紅線 | 承諾 |
|---|---|---|
| 1 | 不動業務代碼 | `pages/`、`components/`、`model/`、`services/`、`app.json` **完全不碰** |
| 2 | 不動資料庫 | **完全不碰**（P4c 是純邏輯，零 I/O） |
| 3 | 不建階段外的雲函數 | **不建任何雲函數** |
| 4 | P1 建立的規則持續生效 | 每步驟跑 `npm run verify` |

---

## 1. 順序風險（先講，不重蹈 P1-T3）

| # | 風險 | 對策 |
|---|---|---|
| **R1** | `Decision` / `Permission` 未建立前，constraints 與 AccessPolicy 都會載入失敗 | T1 先建這兩個 |
| **R2** | **`ProfitSharingPolicy` 建立後，`ComputeProfitShareUseCase` 仍有內聯版本** → 兩份邏輯並存，必然走鐘 | **建立政策與改寫 Use Case 合併為同一個 commit**（T5） |
| **R3** | **`admin` 的權限來源改變**（靜態清單 → `PermissionGroupMatrix`），若 `RolePermissionMatrix` 與 `PermissionGroupMatrix` 分開提交，中間狀態的 admin 權限未定義 | **兩者合併為同一個 commit**（T3） |
| **R4** | `AccessPolicy` 的 `CONSTRAINTS` 表若引用尚未建立的 constraint → 載入期就爆 | constraints 全部在 T2 完成後才建 T3 的 AccessPolicy |

---

## 2. 既有檔案修改（3 檔）

| # | 檔案 | 改動摘要 | 風險 |
|---|---|---|---|
| M1 | `packages/domain/index.js` | 匯出 P4c 全部新物件 | 低 |
| M2 | `packages/application/settlement/ComputeProfitShareUseCase.js` | **移除內聯的分潤基數判斷**（`terms.includesMaterialFee ? ... : ...`），改呼叫 `ProfitSharingPolicy`。移除 `TODO(P4c)` 註解 | 中 |
| M3 | `docs/01-目標架構.md` §4.7.4 | 在 `admin` 的靜態權限清單加註：**實際權限來源已改為 `PermissionGroupMatrix`**（見 §4.8.4），靜態清單僅為 `admin.full` 的內容 | 低 |

---

## 3. 新增檔案（22 檔）

### 3.1 存取控制（12 檔）

| # | 路徑 | 職責 | 依賴 |
|---|---|---|---|
| N1 | `access/Permission.js` | 權限列舉（`resource.action` 字串）。含新增的 `ORDER_VOID`、`ORDER_REVERSE` | 無 |
| N2 | `access/Decision.js` | `allow()` / `deny(reason, details)`。**不拋錯** —— 權限不足是預期結果 | 無 |
| N3 | `access/PermissionGroupMatrix.js` | **新增（§4.8.4）**：`admin.full` / `admin.finance` / `admin.operations` / `admin.support` 四組 → 權限集合 | N1 |
| N4 | `access/RolePermissionMatrix.js` | `customer` / `cs_agent` / `technician` 的靜態矩陣。**`admin` 改由 N3 決定** | N1, N3 |
| N5 | `access/constraints/OwnershipConstraint.js` | 資源歸屬（客戶本人的單／師傅被指派的單） | N2 |
| N6 | `access/constraints/StateConstraint.js` | 「誰能把訂單從什麼狀態轉到什麼狀態」 | N2, `OrderStatus` |
| N7 | `access/constraints/RegionConstraint.js` | 客服只能派自己負責區域的師傅 | N2 |
| N8 | `access/constraints/AmountConstraint.js` | **三重檢查**：單筆門檻／當日配額／**不得超過已付**（後者含 admin）。**fail-closed** | N2 |
| N9 | `access/constraints/PeriodConstraint.js` | **財務關帳期間**不得改金額（沖銷除外） | N2 |
| N10 | `access/constraints/SoDConstraint.js` | **發起者不得批准**（`requestedBy !== actor.id`） | N2 |
| N11 | `access/AccessPolicy.js` | **主入口**：`can(actor, permission, resource)`。純函式，無 Port 依賴 | N1–N10 |
| N12 | `access/ApprovalPolicy.js` | 雙人覆核（改分潤／改價超 20%／作廢訂單）+ **單人例外路徑**（24h 冷卻） | N1, N2 |

### 3.2 策略（8 檔）

| # | 路徑 | 職責 | 關鍵決策依據 |
|---|---|---|---|
| N13 | `order/policies/AddressDisclosurePolicy.js` | 分級揭露。**`now` 以參數傳入** | 接單前＝區域+街道；服務當日 08:00 起＝完整；完工後 7 天降級 |
| N14 | `order/policies/ContactMaskingPolicy.js` | 師傅一律 `MaskedPhone`，**無例外** | §3.4 |
| N15 | `order/policies/ContactChannelPolicy.js` | 通道降級鏈：AXB → 客服三方通話 | A2 |
| N16 | `settlement/ProfitSharingPolicy.js` | 分潤計算。基數參數化（現行＝服務費） | A3／§3.6 |
| N17 | `refund/RefundScope.js` | 退款範圍值物件：`SERVICE_ONLY` / `MATERIAL_ONLY` / `FULL` / `CUSTOM_ITEMS` | A6 |
| N18 | `refund/RefundPolicy.js` | 按明細項計算可退金額；**累計不得超過已付**（硬上限） | A6／Q10 |
| N19 | `audit/AuditChain.js` | `computeHash` / `verifyChain`。**分段鏈**（`chainId`） | Q9 |
| N20 | `reconciliation/ReconciliationThresholds.js` | 三層閾值值物件（1 元／100 元／1000 元），可配置 | Q10 |
| N21 | `reconciliation/ReconciliationService.js` | 系統記錄 vs 帳單的差異比對（純函式） | Q10 |

> 共 9 檔（N13–N21）。

### 3.3 測試（10 檔）

| # | 路徑 | 重點 |
|---|---|---|
| N22 | `tests/unit/domain/access/decision.test.js` | Decision 語意 |
| N23 | `tests/unit/domain/access/permissionMatrix.test.js` | **逐條斷言角色 × 權限**；admin 四權限組；`admin.full` 不得繞過 constraints |
| N24 | `tests/unit/domain/access/accessPolicy.test.js` | **§4.7.6 的三個完整範例** + 純函式性質（同輸入同輸出） |
| N25 | `tests/unit/domain/access/constraints.test.js` | 六個 constraint 的邊界；`AmountConstraint` 三重檢查；fail-closed |
| N26 | `tests/unit/domain/access/approvalPolicy.test.js` | 雙人覆核、同人覆核被拒、24h 單人例外 |
| N27 | `tests/unit/domain/order/policies/addressDisclosure.test.js` | 各角色 × 各階段 × **邊界時間**（08:00 前後、7 天前後） |
| N28 | `tests/unit/domain/order/policies/contactMasking.test.js` | 師傅一律遮罩，**無例外** |
| N29 | `tests/unit/domain/settlement/profitSharing.test.js` | 基數參數化、讀快照、DISPUTED／VOIDED 凍結 |
| N30 | `tests/unit/domain/refund/refundPolicy.test.js` | 按明細項、累計上限、關帳期間拒絕 |
| N31 | `tests/unit/domain/audit/auditChain.test.js` | hash 可重現、篡改可偵測、canonicalJSON 穩定性、分段鏈不互相干擾 |
| N32 | `tests/unit/domain/reconciliation/reconciliation.test.js` | 差異偵測、三層閾值 |

> 共 11 檔（N22–N32）。

**合計新增：12 + 9 + 11 = 32 檔**（原計畫估 22，因 §4.8 新增權限組與測試拆分而增加）

---

## 4. npm script 變更

**無。** `test:domain` 已涵蓋 `tests/unit/domain/**`。**不動任何依賴。**

---

## 5. 驗收標準（逐項可驗證）

### 5.1 自動化

| # | 驗收項 | 指令 | 預期 |
|---|---|---|---|
| P4c-A1 | 依賴方向 | `node scripts/check-layering.js` | `exit=0` |
| P4c-A2 | **domain 零外部依賴** | `grep -rE "wx-server-sdk\|Date\.now\(\|Math\.random\(\|process\.env\|console\." packages/domain/` | **0 筆** |
| P4c-A3 | **`AccessPolicy` 不依賴任何 Port** | `grep -rn "@repair/ports" packages/domain/access/` | **0 筆** |
| P4c-A4 | 全部測試 | `npm test` | `fail 0`，總數 **≥ 560**（P4b 為 427） |
| P4c-A5 | domain 測試離線毫秒級 | `npm run test:domain` | `fail 0`，**< 1 秒** |
| P4c-A6 | **`§4.7.6` 三個範例** | `node --test "tests/unit/domain/access/accessPolicy.test.js"` | 全過 |
| P4c-A7 | **AmountConstraint 三重檢查 + fail-closed** | 同上 constraints | 三層各自可觸發；**讀不到配額時拒絕** |
| P4c-A8 | **SoD 只登記在 `approve_large`** | 同上 | `approve_small` **不觸發** SoD |
| P4c-A9 | **`admin.full` 不得繞過硬上限** | 同上 | 超過已付金額 → 拒絕（即使 `admin.full`） |
| P4c-A10 | 揭露出邊界時間正確 | 同上 addressDisclosure | 08:00 前後、7 天前後 |
| P4c-A11 | 哈希鏈可重現且能偵測篡改 | 同上 auditChain | 同輸入同 hash；改一欄位必變 |
| P4c-A12 | 分段鏈互不干擾 | 同上 | 兩張訂單的鏈獨立 |
| P4c-A13 | `npm run verify` | — | 全綠 |

### 5.2 靜態

| # | 驗收項 | 指令 | 預期 |
|---|---|---|---|
| P4c-B1 | 業務代碼零改動 | `git diff --stat HEAD~N -- pages/ components/ model/ services/ app.json` | **空** |
| P4c-B2 | 資料庫零改動 | `grep -rn "db\.collection\|wx\.cloud\.database" packages/` | **0 筆** |
| P4c-B3 | 未建雲函數 | `ls cloudfunctions/` | 5 支，**不增不減** |
| P4c-B4 | 依賴未變 | `git diff -- package.json` 的依賴區塊 | **空** |

### 5.3 負向測試

| # | 故意違反 | 預期 |
|---|---|---|
| P4c-N1 | 師傅讀他人的訂單 | `NOT_ASSIGNED_TECHNICIAN` |
| P4c-N2 | 師傅呼叫客服 Use Case | `ROLE_NOT_PERMITTED` |
| P4c-N3 | 客服審批 > 200 元退款 | `EXCEEDS_SINGLE_LIMIT` |
| P4c-N4 | 客服當日累計超配額 | `EXCEEDS_DAILY_QUOTA` |
| P4c-N5 | 任何角色讓退款超過已付 | `EXCEEDS_PAID_AMOUNT`（**含 `admin.full`**） |
| P4c-N6 | 讀不到每日配額時 | `DAILY_BUDGET_UNAVAILABLE`（**拒絕，非放行**） |
| P4c-N7 | 發起退款者自己批准大額 | `SoDViolationError` |
| P4c-N8 | 對已關帳期間的訂單改金額 | `PeriodClosedError` |
| P4c-N9 | 同一人雙重覆核 | `ApprovalRequiredError` |
| P4c-N10 | 篡改稽核鏈任一筆 | `verifyChain` 回報斷點位置 |
| P4c-N11 | 師傅試圖取得完整手機號 | `ContactMaskingPolicy` 只回 `MaskedPhone` |
| P4c-N12 | 在 `domain/access/` 內 require `@repair/ports` | `check-layering` 擋下 |

---

## 6. 影響範圍與回滾

| 任務 | 動業務代碼？ | 動資料庫？ | 動 P0–P4b 產物 | 回滾 |
|---|---|---|---|---|
| T1–T6 全部 | ❌ | ❌ | ✅ M1–M3 | `git revert` |

**整體回滾**：`git reset --hard <P4b 最後 commit `f01054c`>` 或 `git reset --hard p1-done`。
**P4c 沒有任何不可逆操作** —— 純程式碼、零 I/O、零雲端資源。

---

## 7. 執行順序

```
T1  Decision + Permission                                  → npm run verify → commit
T2  六個 constraints                                        → npm run verify → commit
T3  PermissionGroupMatrix + RolePermissionMatrix（合併，R3） → npm run verify → commit
T4  AccessPolicy + ApprovalPolicy                           → npm run verify → commit
T5  ProfitSharingPolicy + 改寫 ComputeProfitShareUseCase（合併，R2）→ npm test → commit
T6  其餘策略 6 檔（Address/Contact/ContactChannel/RefundScope/RefundPolicy/AuditChain/Thresholds/Reconciliation）→ commit
T7  測試 11 檔                                              → npm test → commit
    ── 完整驗收 + 逐 commit 稽核（逐一 checkout + sync + verify）──
```

**每個 T 結束都跑 `npm run verify` 並回報。**

---

## 8. 我需要主動指出的風險

| # | 風險 | 說明 |
|---|---|---|
| P4c-R1 | **`AccessPolicy` 的 `CONSTRAINTS` 表是白名單** | 未登記 constraint 的權限 → 只要 RBAC 通過就放行。**新增權限時必須明確宣示意圖**，否則會靜默變成「無額外限制」。測試會斷言「每個涉及資源的權限都有登記」 |
| P4c-R2 | **`admin.full` 的範圍容易被誤解** | 文件與測試都明寫：它只放寬 RBAC，**不放寬 constraint**。驗收項 A9 專門測這件事 |
| P4c-R3 | **`ApprovalPolicy` 的 24h 單人例外是過渡方案** | 程式碼註解與文件都要標明「有第二人後應改回嚴格雙人」，否則會變成永久後門 |
| P4c-R4 | **`StateConstraint` 與 `OrderStateMachine` 的職責重疊風險** | 前者管「**誰**能轉」，後者管「**能不能**轉」。測試要斷言兩者不重複實作同一份規則 |
| P4c-R5 | 檔案數 32，比 P4ab 大 | 若你覺得太大，可拆成兩次回報（T1–T4 存取控制、T5–T7 策略） |

---

## 9. 待你確認

| # | 問題 | 阻塞什麼 |
|---|---|---|
| **Q-A** | **是否同意 P4c 照此執行？** | 全部 |
| Q-B | 檔案數 32 是否要拆成兩次回報？ | 執行節奏 |
| Q-C | （§4.8.0-B）**bcrypt 還是 `crypto.scrypt`？** 我建議 `scrypt`（Node 內建、零依賴、與本專案方向一致） | **P3**（不阻塞 P4c） |
| Q-D | （§4.8.2）**超級管理員要設幾位？** 建議至少 2 位（避免單點） | **P3** |
| Q-E | （§4.8.0-C）JWT 黑名單（每請求一次 DB 讀）vs 短效 token？我採用「2h access + 黑名單」 | **P3** |

---

**⏸ 等你回覆 Q-A／Q-B，以及 P2-0 探針結果、P0 雲端驗證、P1 的 C1／C2／C3。確認後才動代碼。**
