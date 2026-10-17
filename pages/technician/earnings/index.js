/**
 * 師傅端：收益（骨架）。
 *
 * ⚠️ 不顯示分潤比例（Q-E）；P5 只會回傳「已結算／凍結中」的金額。
 */
Page({
  data: {
    ready: false,
    totalCents: 0,
    frozenCents: 0,
    settlements: [],
  },

  onLoad() {
    this.setData({ ready: true });
  },
});
