import Toast from 'tdesign-miniprogram/toast/index';
import { fetchOrders, fetchUserProfile } from '../../services/api/index';
import { formatPhone } from '../../utils/phone';

const IN_PROGRESS_STATUSES = [
  'ASSIGNED_PENDING_ACCEPT',
  'ACCEPTED_PENDING_VISIT',
  'IN_SERVICE',
  'PENDING_ACCEPTANCE',
  'DISPUTED',
];

const MENU_ITEMS = [
  { type: 'favorite', title: '我的收藏', icon: 'star' },
  { type: 'inquiry', title: '我的詢問', icon: 'chat' },
  { type: 'address', title: '地址管理', icon: 'location' },
  { type: 'service', title: '聯繫客服', icon: 'service' },
  { type: 'setting', title: '設置', icon: 'setting' },
];

/**
 * 我的（tabBar 第 5 項）。
 *
 * 資料一律來自 `services/api`：`fetchUserProfile()`／`fetchOrders()`。
 * 訂單宮格只做「帶 tab 跳轉」：把目標 tab 寫進 Storage，訂單頁 onShow 讀取。
 */
Page({
  data: {
    ready: false,
    profile: {},
    orderEntries: [],
    menuItems: MENU_ITEMS,
  },

  onShow() {
    const tabBar = this.getTabBar && this.getTabBar();
    if (tabBar) tabBar.init();
    this.load();
  },

  async load() {
    try {
      const [profile, orders] = await Promise.all([fetchUserProfile(), fetchOrders()]);
      const list = orders.list || [];

      const counts = {
        pendingPayment: list.filter((order) => order.status === 'PENDING_PAYMENT').length,
        pendingAssign: list.filter((order) => order.status === 'PAID_PENDING_ASSIGN').length,
        inProgress: list.filter((order) => IN_PROGRESS_STATUSES.includes(order.status)).length,
        refund: list.filter((order) => order.status === 'COMPLETED').length,
      };

      this.setData({
        ready: true,
        profile: {
          ...profile,
          displayPhone: formatPhone(profile.phone),
        },
        orderEntries: [
          { key: 'pendingPayment', label: '待付款', icon: 'wallet', count: counts.pendingPayment },
          { key: 'pendingAssign', label: '待派單', icon: 'deliver', count: counts.pendingAssign },
          { key: 'inProgress', label: '進行中', icon: 'package', count: counts.inProgress },
          { key: 'refund', label: '退款/售後', icon: 'exchang', count: counts.refund },
        ],
      });
    } catch (err) {
      console.warn('[usercenter] 載入個人資料失敗', err);
      this.setData({ ready: true });
      Toast({ context: this, selector: '#t-toast', message: '資料載入失敗，請稍後再試', icon: '' });
    }
  },

  onOrderTap(e) {
    const { key } = e.currentTarget.dataset;
    const tabMap = {
      pendingPayment: 'pending_payment',
      pendingAssign: 'in_progress',
      inProgress: 'in_progress',
      refund: 'completed',
    };
    wx.setStorageSync('orders.activeTab', tabMap[key] || 'all');
    wx.switchTab({ url: '/pages/orders/index' });
  },

  onAllOrders() {
    wx.setStorageSync('orders.activeTab', 'all');
    wx.switchTab({ url: '/pages/orders/index' });
  },

  onMenuTap(e) {
    const { type } = e.currentTarget.dataset;
    const routes = {
      favorite: '/pages/user/favorites/index',
      inquiry: '/pages/user/inquiries/index',
      address: '/pages/user/address/list/index',
      setting: '/pages/user/settings/index',
    };
    if (routes[type]) {
      wx.navigateTo({ url: routes[type] });
      return;
    }
    if (type === 'service') {
      const phone = this.data.profile && this.data.profile.customerServicePhone;
      if (phone && wx.makePhoneCall) {
        wx.makePhoneCall({ phoneNumber: phone, fail: () => {} });
      } else {
        Toast({ context: this, selector: '#t-toast', message: '客服熱線建置中', icon: '' });
      }
    }
  },
});
