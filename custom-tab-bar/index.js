import TabMenu from './data';

/**
 * 自訂 tabBar（**僅服務客戶端**）。
 *
 * 師傅端／客服端／管理員不走 tabBar，而是由 `utils/roleRouter`
 * 以 `wx.reLaunch` 導向各自的工作台。原因見 `data.js` 的說明
 * （`tabBar.list` 上限 5 項 + tabBar 頁面必須在主包）。
 *
 * ⚠️ 本檔不做任何角色判斷 —— 它只負責渲染這 4 項與切換。
 *    這是刻意的：**tabBar 是導覽元件，不是權限邊界**。
 */
Component({
  data: {
    active: 0,
    list: TabMenu,
  },

  methods: {
    onChange(event) {
      const index = event.detail.value;
      const target = this.data.list[index];
      if (!target) return;

      this.setData({ active: index });
      wx.switchTab({
        url: target.url.startsWith('/') ? target.url : `/${target.url}`,
      });
    },

    /** 由各頁面的 onShow 呼叫，讓 tabBar 高亮目前頁面 */
    init() {
      const pages = getCurrentPages();
      const page = pages.length > 0 ? pages[pages.length - 1] : null;
      const route = page ? page.route.split('?')[0] : '';

      const active = this.data.list.findIndex((item) => {
        const url = item.url.startsWith('/') ? item.url.slice(1) : item.url;
        return url === route;
      });

      // 找不到對應項目時給 -1（全部不亮），而不是硬套 0
      // —— 硬套 0 會讓「不在 tabBar 的頁面」誤亮第一項
      this.setData({ active });
    },
  },
});
