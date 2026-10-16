/**
 * 訂單（主包）。
 *
 * ⚠️ **必須在主包** —— 微信的 tabBar 頁面不能放在分包裡。
 *    分包的 `pages/order/order-list` 仍存在（既有頁面），但那是從其他入口進入的。
 *
 * P7a-1 只建骨架（確認編譯與導覽可用），內容於 **P7a-2** 填上。
 */
Page({
  data: {
    ready: false,
  },

  onLoad() {
    this.setData({ ready: true });
  },
});
