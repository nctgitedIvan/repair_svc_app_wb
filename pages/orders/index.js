import Toast from 'tdesign-miniprogram/toast/index';
import Dialog from 'tdesign-miniprogram/dialog/index';
import dayjs from 'dayjs';
import {
  fetchOrders,
  payOrder,
  cancelOrder,
  requestRefund,
} from '../../services/api/index';

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
 * ## 資料來源（紅線）
 *
 * 一律走 `services/api`：
 * - `fetchOrders()`／`fetchOrderDetail()`：讀取
 * - `payOrder()`／`cancelOrder()`／`requestRefund()`：P7a 的模擬寫入
 *
 * P7b 切到 `apiMode='cloud'` 後，頁面不需要改，只會換成真實雲函數。
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
    /** 正在支付的訂單（避免重複點擊） */
    busyOrderId: '',
    /** 退款彈窗 */
    refundVisible: false,
    refundOrderId: '',
    refundAmount: '',
    refundReason: '',
    refundSubmitting: false,
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
    const handlers = {
      pay: this.onPay,
      cancel: this.onCancel,
      refund: this.openRefund,
      detail: this.onGotoDetail,
    };
    const handler = handlers[action];
    if (handler) handler.call(this, e);
  },

  /** 去支付：呼叫模擬支付 API，成功後刷新列表 */
  async onPay(e) {
    const { orderId } = e.currentTarget.dataset;
    if (!orderId || this.data.busyOrderId) return;

    this.setData({ busyOrderId: orderId });
    try {
      await payOrder(orderId);
      Toast({ context: this, selector: '#t-toast', message: '支付成功', icon: 'check-circle' });
      await this.load();
    } catch (err) {
      Toast({ context: this, selector: '#t-toast', message: err.message || '支付失敗，請稍後再試', icon: '' });
    } finally {
      this.setData({ busyOrderId: '' });
    }
  },

  /** 取消訂單：先確認，再呼叫模擬取消 API */
  onCancel(e) {
    const { orderId } = e.currentTarget.dataset;
    if (!orderId || this.data.busyOrderId) return;

    Dialog.confirm({
      title: '取消訂單',
      content: '取消後需重新下單，確定要取消嗎？',
      confirmBtn: '確定取消',
      cancelBtn: '再想想',
    })
      .then(async () => {
        try {
          await cancelOrder(orderId);
          Toast({ context: this, selector: '#t-toast', message: '訂單已取消', icon: '' });
          await this.load();
        } catch (err) {
          Toast({ context: this, selector: '#t-toast', message: err.message || '取消失敗，請稍後再試', icon: '' });
        }
      })
      .catch(() => {});
  },

  /** 申請退款：開啟退款表單 */
  openRefund(e) {
    const { orderId } = e.currentTarget.dataset;
    const order = this.data.orders.find((entry) => entry.orderId === orderId);
    if (!order) return;

    this.setData({
      refundVisible: true,
      refundOrderId: orderId,
      refundAmount: (order.amounts.totalCents / 100).toFixed(2),
      refundReason: '',
    });
  },

  onRefundVisibleChange(e) {
    if (!e.detail || !e.detail.visible) this.closeRefund();
  },

  closeRefund() {
    if (this.data.refundSubmitting) return;
    this.setData({ refundVisible: false, refundOrderId: '', refundAmount: '', refundReason: '' });
  },

  onRefundAmountChange(e) {
    this.setData({ refundAmount: e.detail.value });
  },

  onRefundReasonChange(e) {
    this.setData({ refundReason: e.detail.value });
  },

  /** 提交退款申請（模擬 API；不改訂單狀態） */
  async submitRefund() {
    const { refundOrderId, refundAmount, refundReason, refundSubmitting } = this.data;
    if (!refundOrderId || refundSubmitting) return;

    const yuan = Number(refundAmount);
    if (!Number.isFinite(yuan) || yuan <= 0) {
      Toast({ context: this, selector: '#t-toast', message: '請輸入正確的退款金額', icon: '' });
      return;
    }
    const amountCents = Math.round(yuan * 100);

    this.setData({ refundSubmitting: true });
    try {
      await requestRefund(refundOrderId, amountCents, refundReason);
      this.setData({ refundVisible: false, refundOrderId: '', refundAmount: '', refundReason: '' });
      Toast({ context: this, selector: '#t-toast', message: '退款申請已提交', icon: 'check-circle' });
      await this.load();
    } catch (err) {
      Toast({ context: this, selector: '#t-toast', message: err.message || '提交失敗，請稍後再試', icon: '' });
    } finally {
      this.setData({ refundSubmitting: false });
    }
  },

  /** 查看詳情：訂單詳情頁（使用 orderNo 查詢） */
  onGotoDetail(e) {
    const { orderNo } = e.currentTarget.dataset;
    if (!orderNo) return;
    wx.navigateTo({
      url: `/pages/order/order-detail/index?orderNo=${encodeURIComponent(orderNo)}`,
    });
  },
});
