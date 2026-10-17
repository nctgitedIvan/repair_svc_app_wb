/**
 * 設置（T6a.1-4）—— **目前只做骨架**。
 *
 * ## 為什麼先建骨架
 *
 * 「我的」需要一個設置入口，但設置頁的內容（通知開關、地址預設、帳號相關…）
 * **尚未定案**，而且多數項目依賴後端（P3 身分、P5 Use Case）。
 * 先建頁面讓入口可達，比留一個死連結好。
 *
 * ## 這裡**不放**什麼（刻意的）
 *
 * - **不放「清除本機資料」**：購物車與收藏都還在 P7a 的臨時 Storage，
 *   清錯會讓使用者以為資料不見了。等 P7b 接上後端再一起設計。
 * - **不放角色／權限相關設定**：那屬 P3／P8。
 *
 * 目前只顯示版本資訊，作為「頁面確實存在」的證據。
 */
Page({
  data: {
    version: '',
  },

  onLoad() {
    // 與 `pages/usercenter` 取版本的方式一致（getAccountInfoSync）
    try {
      const info = wx.getAccountInfoSync ? wx.getAccountInfoSync() : null;
      this.setData({ version: (info && info.miniProgram && info.miniProgram.version) || '開發版' });
    } catch (err) {
      this.setData({ version: '開發版' });
    }
  },
});
