import Toast from 'tdesign-miniprogram/toast/index';
import { fetchOrders, fetchUserProfile } from '../../services/api/index';

/** 進行中的訂單狀態（與訂單頁同一組） */
const IN_PROGRESS_STATUSES = [
  'ASSIGNED_PENDING_ACCEPT',
  'ACCEPTED_PENDING_VISIT',
  'IN_SERVICE',
  'DISPUTED',
];

/**
 * 選單（保留原版 t-cell 列表樣式）。
 *
 * 第一組／第二組的分法沿用 TDesign 零售版型；
 * 電商的「優惠券／積分」已移除，改為維修平台入口。
 */
const MENU_DATA = [
  {
    key: 'account',
    items: [
      { title: '我的收藏', type: 'favorite' },
      { title: '我的詢問', type: 'inquiry' },
      { title: '地址管理', type: 'address' },
    ],
  },
  {
    key: 'support',
    items: [
      { title: '聯繫客服', type: 'service', icon: 'service' },
      { title: '設置', type: 'setting' },
    ],
  },
];

/**
 * 訂單宮格（圖示沿用原版 Icon 橫向排列）。
 *
 * 原電商文案 → 維修平台語意：
 * | 原版 | 現在 |
 * |---|---|
 * | 待發貨 | 待派單（PAID_PENDING_ASSIGN） |
 * | 待收貨 | 進行中（已派單／待上門／服務中） |
 * | 待評價 | 待驗收（PENDING_ACCEPTANCE） |
 * | 退款/售後 | 已完成（COMPLETED） |
 */
const ORDER_ENTRIES = [
  { key: 'pendingPayment', title: '待付款', iconName: 'wallet', tab: 'pending_payment', statuses: ['PENDING_PAYMENT'] },
  { key: 'pendingAssign', title: '待派單', iconName: 'deliver', tab: 'in_progress', statuses: ['PAID_PENDING_ASSIGN'] },
  { key: 'inProgress', title: '進行中', iconName: 'package', tab: 'in_progress', statuses: IN_PROGRESS_STATUSES },
  { key: 'pendingAcceptance', title: '待驗收', iconName: 'comment', tab: 'in_progress', statuses: ['PENDING_ACCEPTANCE'] },
  { key: 'completed', title: '已完成', iconName: 'exchang', tab: 'completed', statuses: ['COMPLETED'] },
];

const getDefaultData = () => ({
  showMakePhone: false,
  userInfo: {
    avatarUrl: '',
    nickName: '正在載入…',
  },
  menuData: MENU_DATA,
  orderTagInfos: ORDER_ENTRIES.map((entry) => ({
    title: entry.title,
    iconName: entry.iconName,
    tab: entry.tab,
    orderNum: 0,
  })),
  customerServiceInfo: {},
  currAuthStep: 2,
  showKefu: true,
  versionNo: '',
});

/**
 * 我的（tabBar 第 5 項）—— 原版 TDesign 個人中心版型。
 *
 * ## 版面
 *
 * `t-user-center-card`（頭像區）→ `t-order-group`（訂單 Icon 列）
 * → `t-cell-group`（選單）→ 版本號。
 *
 * ## 資料來源（紅線）
 *
 * 一律走 `services/api`：`fetchUserProfile()`／`fetchOrders()`。
 * 頁面不寫死使用者資料、訂單數量或客服電話。
 */
Page({
  data: getDefaultData(),

  onLoad() {
    this.getVersionInfo();
  },

  onShow() {
    const tabBar = this.getTabBar && this.getTabBar();
    if (tabBar) tabBar.init();
    this.init();
  },

  onPullDownRefresh() {
    this.init();
  },

  async init() {
    try {
      const [profile, orders] = await Promise.all([fetchUserProfile(), fetchOrders()]);
      const list = orders.list || [];

      this.setData({
        userInfo: {
          avatarUrl: profile.avatarUrl || '',
          nickName: profile.nickname || '維修平台用戶',
        },
        customerServiceInfo: {
          servicePhone: profile.customerServicePhone || '',
        },
        orderTagInfos: ORDER_ENTRIES.map((entry) => ({
          title: entry.title,
          iconName: entry.iconName,
          tab: entry.tab,
          orderNum: list.filter((order) => entry.statuses.includes(order.status)).length,
        })),
        currAuthStep: 2,
      });
    } catch (err) {
      console.warn('[usercenter] 載入個人資料失敗', err);
      this.setData({
        userInfo: { avatarUrl: '', nickName: '維修平台用戶' },
        currAuthStep: 2,
      });
      Toast({ context: this, selector: '#t-toast', message: '資料載入失敗，請稍後再試', icon: '' });
    } finally {
      wx.stopPullDownRefresh();
    }
  },

  /** 訂單宮格：帶 tab 跳轉（訂單頁 onShow 讀 Storage） */
  jumpNav(e) {
    const item = e.detail || {};
    this.openOrders(item.tab || 'in_progress');
  },

  jumpAllOrder() {
    this.openOrders('all');
  },

  openOrders(tab) {
    wx.setStorageSync('orders.activeTab', tab);
    wx.switchTab({ url: '/pages/orders/index' });
  },

  onClickCell({ currentTarget }) {
    const { type } = currentTarget.dataset;
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
      this.openMakePhone();
    }
  },

  openMakePhone() {
    this.setData({ showMakePhone: true });
  },

  closeMakePhone() {
    this.setData({ showMakePhone: false });
  },

  call() {
    const phone = this.data.customerServiceInfo.servicePhone;
    if (!phone) {
      Toast({ context: this, selector: '#t-toast', message: '客服熱線建置中', icon: '' });
      return;
    }
    // 客戶主動撥打平台客服（非客戶號碼，白名單見 scripts/check-frontend.js）
    wx.makePhoneCall({ phoneNumber: phone, fail: () => {} });
  },

  gotoUserEditPage() {
    if (this.data.currAuthStep === 2) {
      wx.navigateTo({ url: '/pages/user/person-info/index' });
      return;
    }
    this.init();
  },

  getVersionInfo() {
    try {
      const { miniProgram = {} } = wx.getAccountInfoSync();
      const versionNo =
        miniProgram.envVersion === 'release' ? miniProgram.version : miniProgram.envVersion || '';
      this.setData({ versionNo });
    } catch (err) {
      // 開發工具或舊基礎庫可能沒有 getAccountInfoSync；版本號只是頁尾資訊
    }
  },
});
