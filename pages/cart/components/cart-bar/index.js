/**
 * 購物車底部結算列（全選／合計／去結算）。
 *
 * ## T4 的三個改動
 *
 * 1. **移除優惠券／折扣欄位**（`totalDiscountAmount`）—— A7 已定優惠券下線
 *    （`docs/01` §3.7.7 只撤銷了購物車，沒有撤銷優惠券）。
 * 2. **全選不再自己翻轉狀態**：舊版 `handleSelectAll` 先 `setData` 翻轉自己，
 *    再發出「翻轉前」的值，於是同一件事有兩個來源（元件的 data 與頁面的 data），
 *    兩邊一旦不同步就會出現「按了沒反應」。現在只發出**目標狀態**，
 *    **狀態的唯一來源是頁面**。
 * 3. **按鈕可用狀態由 WXML 直接算**（`totalGoodsNum > 0`）：
 *    舊版用 `property observer + setTimeout + setData` 維護一個 `isDisabled`，
 *    那是不必要的狀態同步（而且 `setTimeout` 是為了繞開在 observer 內 setData 的限制）。
 *    能用資料直接算出來的東西，就不要另外存一份。
 */
Component({
  options: {
    addGlobalClass: true,
  },

  properties: {
    /** 目前是否全選（由頁面決定，元件不自行推斷） */
    isAllSelected: {
      type: Boolean,
      value: false,
    },
    /** 合計金額（**分**；`price` 元件吃分） */
    totalAmount: {
      type: Number,
      value: 0,
    },
    /** 已勾選的**件數合計**（不是明細筆數） */
    totalGoodsNum: {
      type: Number,
      value: 0,
    },
    bottomHeight: {
      type: Number,
      value: 100,
    },
    fixed: Boolean,
  },

  methods: {
    /** 發出「目標狀態」，不自行翻轉（見檔頭第 2 點） */
    handleSelectAll() {
      this.triggerEvent('selectall', { isSelected: !this.data.isAllSelected });
    },

    handleToSettle() {
      // 沒有勾選任何商品就不送出（頁面也會再擋一次，這裡只是省一次往返）
      if (!this.data.totalGoodsNum) return;
      this.triggerEvent('settle');
    },
  },
});
