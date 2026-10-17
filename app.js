import updateManager from './common/updateManager';
import { config } from './config/index';
import { homePathForRole } from './utils/roleRouter';
import { getMyRole } from './services/api/index';

/**
 * 小程式入口。
 *
 * P7a-1 新增：**登入後的角色分發**。
 *
 * ⚠️ 角色**只能**由後端決定（`getMyRole` 用 OPENID 查 `users`）。
 *    前端不得自行推斷、也不得把角色快取到 Storage 後改寫。
 *
 * ⚠️ 分發是**體驗優化，不是安全邊界**。
 *    即使有人繞過前端直接呼叫雲函數，`entrypoint` 的 `authenticate()` 仍會擋下。
 */
App({
  globalData: {
    /** 目前登入者的角色（僅供 UI 顯示使用） */
    role: null,
    /** getMyRole 是否已完成 */
    roleResolved: false,
  },

  onLaunch() {
    if (!config.repairMode) return; // 舊模式不做分發，行為與改造前一致
    this.dispatchByRole();
  },

  onShow() {
    updateManager();
  },

  /**
   * 依角色導向對應首頁。
   *
   * ⚠️ **失敗一律靜默留在當前頁**，不跳錯誤彈窗。
   *    理由：取角色失敗（網路、後端未就緒）不該擋住使用者；
   *    真要在意，後端 API 本身就會拒絕未授權的操作。
   */
  async dispatchByRole() {
    try {
      const { role } = await getMyRole();
      this.globalData.role = role;
      this.globalData.roleResolved = true;

      const target = homePathForRole(role);

      // 已在目標頁就不重導 —— 避免啟動時不必要的閃爍
      const pages = getCurrentPages();
      const current = pages.length > 0 ? pages[pages.length - 1] : null;
      const currentRoute = current ? `/${current.route}` : '';
      if (currentRoute === target) return;

      wx.reLaunch({
        url: target,
        fail: () => {
          // 目標頁尚未建立時（客服端工作台仍待建置）
          // 留在當前頁並在 console 留下一行說明，而不是靜默無感
          console.warn(`[roleRouter] 目標頁尚未建立：${target}`);
        },
      });
    } catch (err) {
      // 取角色失敗不阻斷啟動
      console.warn('[roleRouter] 取得角色失敗，留在預設首頁', err);
    }
  },
});
