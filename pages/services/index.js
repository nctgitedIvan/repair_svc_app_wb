/**
 * 服務首頁（主包）。
 *
 * ⚠️ **必須在主包** —— 微信的 tabBar 頁面不能放在分包裡。
 *    因此這裡不是 `pages/service`（分包），而是主包的 `pages/services`。
 *
 * P7a-1 只建骨架（確認編譯與導覽可用），實際內容於 **P7a-2** 填上：
 *   - 服務分類入口
 *   - 熱門服務列表
 *   - 搜尋
 *
 * 依 Q-D 決策：**純服務**，不放電商內容（推薦商品等）。
 * 理由：A7 已定電商入口下線；維修場景核心是「快速找服務 → 下單 → 等派單」。
 */
Page({
  data: {
    ready: false,
  },

  onLoad() {
    // P7a-2 會在這裡呼叫 fetchServices()
    this.setData({ ready: true });
  },
});
