const inquiryRules = require('../../../utils/inquiry.js');

/**
 * 我的詢問（T6b）。
 *
 * ## 資料來源
 *
 * `utils/inquiry.js` 的**本機 Storage**（`repair.inquiries.v1`，與購物車／收藏同一策略）。
 * ⚠️ 這是 **P7a 的臨時方案**：正式的詢問寫在 `inquiries` 集合（`docs/01` §7.2 第 8 點），
 * 集合是 **P2** 才建。P7b 接上後端後，本頁只需換掉讀寫來源（`loadInquiries`）。
 *
 * ## ⚠️ 客服回覆需 P5
 *
 * P7a 沒有客服端，因此正常情況下所有詢問都是 `pending`。
 * 清單仍會顯示 `replied`／`closed` 與最後一則回覆 —— P5 接上後即可直接使用。
 */
Page({
  data: {
    ready: false,
    rows: [],
  },

  onShow() {
    this.refresh();
  },

  refresh() {
    const store = inquiryRules.loadInquiries();
    const rows = inquiryRules
      .listInquiries(store)
      .map((entry) => inquiryRules.toRowModel(entry))
      .filter(Boolean);
    this.setData({ ready: true, rows });
  },

  /** 點詢問列 → 商品詳情（詢問的鍵是 product_id） */
  onRowTap(e) {
    const { productId } = e.currentTarget.dataset;
    if (!productId) return;
    wx.navigateTo({ url: `/pages/goods/details/index?productId=${productId}` });
  },

  /** 空清單 → 去逛逛零件（與收藏頁一致） */
  onGotoShop() {
    wx.navigateTo({ url: '/pages/goods/list/index' });
  },
});
