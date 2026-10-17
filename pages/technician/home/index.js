/**
 * 師傅端：接單大廳（骨架）。
 *
 * ⚠️ 目前沒有師傅端 API：不顯示任何客戶資料。
 *    P5 接上派單後，這裡只渲染「脫敏後」的任務 DTO。
 */
Page({
  data: {
    ready: false,
    stats: {
      available: 0,
      inProgress: 0,
      todayDone: 0,
    },
    orders: [],
  },

  onLoad() {
    this.setData({ ready: true });
  },
});
