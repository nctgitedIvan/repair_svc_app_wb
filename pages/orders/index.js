import Toast from 'tdesign-miniprogram/toast/index';
import dayjs from 'dayjs';
import { fetchOrders } from '../../services/api/index';

const TABS = [
  { key: 'all', label: '全部' },
  { key: 'pending_payment', label: '待付款' },
  { key: 'in_progress', label: '進行中' },
  { key: 'completed', label: '已完成' },
];

const IN_PROGRESS_STATUSES = [
  'PAID_PENDING_ASSIGN',
  'ASSIGNED_PENDING_ACCEPT',
  'ACCEPTED_PENDING_VISIT',
  'IN_SERVICE',
  'PENDING_ACCEPTANCE',
  'DISPUTED',
];

/**
 * 訂單頁（tabBar 第 4 項）。
 *
 * 資料一律來自 `services/api.fetchOrders()`（P7a fake），
 * 本頁只負責分頁籤、卡片與按鈕事件。
 */
Page({
  data: {
    tabs: TABS,
    activeTab: 'all',
    allOrders: [],
    orders: [],
    loading: true,
    ready: false,
    loadError: false,
  },

  onShow() {
    const tabBar = this.getTabBar && this.getTabBar();
    if (tabBar) tabBar.init();

    // 「我的」宮格透過 Storage 指定要開哪個 tab
    const desired = wx.getStorageSync('orders.activeTab');
    if (desired && TABS.some((tab) => tab.key === desired)) {
      this.setData({ activeTab: desired });
      wx.removeStorageSync('orders.activeTab');
    }

    this.load();
  },

  async load() {
    this.setData({ loading: true, loadError: false });
    try {
      const { list } = await fetchOrders();
      const orders = (list || []).map((order) => ({
        ...order,
        createdAtText: order.createdAt ? dayjs(order.createdAt).format('YYYY-MM-DD HH:mm') : '',
      }));
      this.setData({ allOrders: orders, loading: false, ready: true }, () => this.applyFilter());
    } catch (err) {
      console.warn('[orders] 載入訂單失敗', err);
      this.setData({ loading: false, ready: true, loadError: true, allOrders: [], orders: [] });
      Toast({ context: this, selector: '#t-toast', message: '訂單載入失敗，請稍後再試', icon: '' });
    }
  },

  applyFilter() {
    const { activeTab, allOrders } = this.data;
    let orders = allOrders;

    if (activeTab === 'pending_payment') {
      orders = allOrders.filter((order) => order.status === 'PENDING_PAYMENT');
    } else if (activeTab === 'in_progress') {
      orders = allOrders.filter((order) => IN_PROGRESS_STATUSES.includes(order.status));
    } else if (activeTab === 'completed') {
      orders = allOrders.filter((order) => order.status === 'COMPLETED');
    }

    this.setData({ orders });
  },

  onTabChange(e) {
    const { key } = e.currentTarget.dataset;
    this.setData({ activeTab: key }, () => this.applyFilter());
  },

  onRetry() {
    this.load();
  },

  onGotoShop() {
    wx.navigateTo({ url: '/pages/goods/list/index' });
  },

  onOrderAction(e) {
    const { action } = e.currentTarget.dataset;
    const messages = {
      pay: '支付功能建置中（P6）',
      cancel: '取消訂單功能建置中（P5 後）',
      refund: '退款申請建置中（P5 後）',
      detail: '訂單詳情建置中（P5 後）',
    };
    Toast({ context: this, selector: '#t-toast', message: messages[action] || '功能建置中', icon: '' });
  },
});
