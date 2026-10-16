/**
 * ⚠️ **DEPRECATED：此頁面已被 `pages/category/index` 取代（T3.6）**
 * 保留作為歷史參考，不再維護。若確認無用，另開階段刪除。
 *
 * ## 為什麼保留
 *
 * P7a-1 建了這個骨架當 tabBar 的「服務」入口，T3.5 把文字改成「分類」卻沒改指向，
 * 於是它變成「tabBar 寫分類、點進去是空殼」的那個空殼。
 *
 * T3.6 查出 **TDesign 的原始分類頁一直都在 repo 裡沒被動過**
 * （`pages/category/index` ＋ `goods-category` 元件），因此改成把 tabBar 指回去，
 * 而不是在這裡重寫一個分類頁。本檔因此不再被任何地方指向。
 *
 * ⚠️ 依紅線 7（不刪除現有功能）**不刪除**，且仍保留在 `app.json` 的 `pages` 清單中。
 */
Page({
  data: {
    ready: false,
  },

  onLoad() {
    this.setData({ ready: true });
  },
});
