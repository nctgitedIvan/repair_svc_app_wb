/**
 * 師傅端：我的任務（骨架）。
 *
 * 顯示狀態 chips 與空態；P5 接上 `fetchTechnicianTasks` 的脫敏 DTO 後再填充。
 */
const TABS = [
  { key: 'accepted', label: '待上門' },
  { key: 'in_service', label: '服務中' },
  { key: 'pending_acceptance', label: '待驗收' },
];

Page({
  data: {
    ready: false,
    tabs: TABS,
    activeTab: 'accepted',
    tasks: [],
  },

  onLoad() {
    this.setData({ ready: true });
  },

  onTabChange(e) {
    const { key } = e.currentTarget.dataset;
    this.setData({ activeTab: key });
  },

  onTaskTap() {
    // 骨架：P5 接上任務詳情後再導覽
    wx.showToast({ title: '任務詳情建置中', icon: 'none' });
  },
});
