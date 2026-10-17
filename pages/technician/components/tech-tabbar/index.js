/**
 * 師傅端自製底部導覽（與 C 端 tabBar 完全隔離）。
 *
 * ⚠️ 不使用原生 tabBar：
 *   tabBar 只服務客戶端 5 項，且 tabBar 頁面必須在主包。
 *   師傅端是分包，用 `wx.redirectTo` 在同分包內切換。
 */
const TABS = Object.freeze([
  { key: 'home', text: '接單大廳', icon: 'home', url: '/pages/technician/home/index' },
  { key: 'tasks', text: '我的任務', icon: 'list', url: '/pages/technician/tasks/index' },
  { key: 'earnings', text: '收益', icon: 'wallet', url: '/pages/technician/earnings/index' },
  { key: 'apply', text: '入駐', icon: 'person', url: '/pages/technician/apply/index' },
]);

Component({
  properties: {
    active: {
      type: String,
      value: 'home',
    },
  },

  data: {
    tabs: TABS,
  },

  methods: {
    onTap(e) {
      const { key } = e.currentTarget.dataset;
      if (!key || key === this.data.active) return;

      const tab = this.data.tabs.find((entry) => entry.key === key);
      if (!tab) return;

      wx.redirectTo({ url: tab.url });
    },
  },
});
