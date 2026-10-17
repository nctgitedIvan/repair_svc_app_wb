import Toast from 'tdesign-miniprogram/toast/index';
import dayjs from 'dayjs';
import { fetchProducts, fetchServices, fetchMyCoupons } from '../../../services/api/index';
import { fetchDeliveryAddressList } from '../../../services/address/fetchAddress';
import { getAddressPromise } from '../../../services/address/list';

const checkoutView = require('../../../utils/checkoutView.js');
const couponView = require('../../../utils/couponView.js');
const cartRules = require('../../../utils/cart.js');

/** 優惠券日期顯示（只在畫面層格式化） */
const formatCouponDate = (ms) => (Number.isInteger(ms) ? dayjs(ms).format('YYYY-MM-DD') : '');

/**
 * 結算頁（T7）。
 *
 * ## 這一頁讀什麼
 *
 * 只讀 **`repair.checkout.v1`**（`utils/cart.js` 的 `CHECKOUT_KEY`）——
 * 購物車、商品立即購買、服務立即預約都先轉成 `docs/01` §3.8 的統一契約。
 * T4 的舊格式與相容橋接已於 T7 移除。
 *
 * ## 金額
 *
 * 一律以**現價**重算（`utils/checkoutView.buildCheckoutView()`，純函式）：
 * 材料費（商品）＋ 服務費（服務）＝ 商品總額；再扣除優惠券 = 合計。
 * 選券／取消券時會同步更新 payload 的 `expectedTotalCents`（折扣後總額），
 * 因此「價格已更新」偵測比較的是折扣後總額。
 *
 * ## ⚠️ P7a 的限制
 *
 * - 沒有訂單後端與支付：提交只做**模擬成功**（`wx.showModal`）。
 * - 地址沿用既有的 mock 地址列表；進入頁面時讀取 `isDefault` 的地址。
 * - 預約時間尚未實作（P7a-2b），服務／混合單顯示佔位。
 * - 成功後導向 `pages/orders/index`（訂單 tab；內容屬 P7a-2）。
 */

const ORDER_TYPE_LABEL = {
  product: '零件訂單',
  service: '服務訂單',
  mixed: '服務＋零件',
};

Page({
  data: {
    ready: false,
    loading: true,
    loadError: false,
    /** 沒有結算資料（直接進來、或已被清掉） */
    missingPayload: false,
    /** 沒有 payload 或格式錯誤時顯示 */
    payloadError: false,
    /** `checkoutView.buildCheckoutView()` 的結果 */
    view: null,
    orderTypeLabel: '',
    /** 地址（預設或使用者選擇） */
    address: null,
    submitting: false,
    /** 優惠券 */
    couponRows: [],
    usableCouponCount: 0,
    selectedCoupon: null,
    couponVisible: false,
    discountText: '0',
    subtotalText: '0',
    totalText: '0',
  },

  payload: null,
  products: [],
  services: [],
  coupons: [],
  selectedCoupon: null,

  onLoad() {
    this.load();
  },

  async load() {
    this.setData({ loading: true, loadError: false, missingPayload: false, payloadError: false });

    let payload;
    try {
      const raw = wx.getStorageSync(checkoutView.CHECKOUT_KEY);
      if (!raw) {
        this.setData({ ready: true, loading: false, missingPayload: true });
        return;
      }
      payload = typeof raw === 'string' ? JSON.parse(raw) : raw;
    } catch (err) {
      console.warn('[checkout] 結算資料無法解析', err);
      this.setData({ ready: true, loading: false, payloadError: true });
      return;
    }

    this.payload = payload;

    try {
      const [products, services, couponResult] = await Promise.all([
        fetchProducts(),
        fetchServices(),
        fetchMyCoupons(),
      ]);

      this.products = products.list || [];
      this.services = services.list || [];
      this.coupons = couponResult.list || [];

      // 還原上次選取的券（payload.userCouponId 由本頁在選券時寫入）
      const savedId = this.payload.userCouponId;
      this.selectedCoupon = savedId
        ? this.coupons.find((coupon) => coupon.userCouponId === savedId) || null
        : null;

      let view = this.buildView();
      let payloadChanged = false;

      // 券已不存在（例如後台回收）→ 清掉
      if (savedId && !this.selectedCoupon) {
        this.payload.userCouponId = null;
        payloadChanged = true;
      }

      // 券已失效（過期／門檻變更／已使用）→ 清掉，避免卡在不可用的折扣
      if (this.selectedCoupon && view.couponInvalidReason) {
        this.selectedCoupon = null;
        this.payload.userCouponId = null;
        payloadChanged = true;
      }

      if (payloadChanged) {
        this.payload.expectedTotalCents = view.goodsTotalCents;
        this.persistPayload();
        view = this.buildView();
      }

      this.applyView(view);

      if (view.errors && view.errors.length > 0) {
        this.setData({ payloadError: true });
        return;
      }

      this.loadDefaultAddress();
    } catch (err) {
      console.warn('[checkout] 載入商品／服務現況失敗', err);
      this.setData({ ready: true, loading: false, loadError: true });
    }
  },

  /** 以目前 payload／selectedCoupon 重算 view（純函式的唯一呼叫點） */
  buildView() {
    return checkoutView.buildCheckoutView({
      payload: this.payload,
      products: this.products,
      services: this.services,
      coupon: this.selectedCoupon,
      now: Date.now(),
    });
  },

  /** 套用 view ＋ 優惠券的顯示欄位 */
  applyView(view, extra = {}) {
    const now = Date.now();
    const couponRows = couponView.decorateList(
      this.coupons,
      view.goodsTotalCents,
      now,
      formatCouponDate,
    );

    this.setData({
      ready: true,
      loading: false,
      view,
      orderTypeLabel: ORDER_TYPE_LABEL[view.orderType] || '',
      selectedCoupon: view.coupon
        ? couponView.decorate(view.coupon, view.goodsTotalCents, now, formatCouponDate)
        : null,
      couponRows,
      usableCouponCount: couponRows.filter((row) => row.usable).length,
      discountText: couponView.formatYuan(view.discountCents),
      subtotalText: couponView.formatYuan(view.goodsTotalCents),
      totalText: couponView.formatYuan(view.totalCents),
      ...extra,
    });
  },

  /** 把選券結果寫回結算 payload（expectedTotalCents 為折扣後總額） */
  persistPayload() {
    try {
      wx.setStorageSync(checkoutView.CHECKOUT_KEY, this.payload);
    } catch (err) {
      console.warn('[checkout] 儲存優惠券選擇失敗', err);
    }
  },

  onOpenCoupon() {
    if (!this.coupons || this.coupons.length === 0) {
      Toast({ context: this, selector: '#t-toast', message: '目前沒有可用的優惠券', icon: '' });
      return;
    }
    this.setData({ couponVisible: true });
  },

  onCouponVisibleChange(e) {
    if (!e.detail || !e.detail.visible) this.setData({ couponVisible: false });
  },

  closeCoupon() {
    this.setData({ couponVisible: false });
  },

  /** 選擇／取消優惠券（id = 'none' 代表不使用） */
  onSelectCoupon(e) {
    const { id } = e.currentTarget.dataset;

    if (id === 'none') {
      this.selectedCoupon = null;
    } else {
      const coupon = this.coupons.find((entry) => entry.userCouponId === id);
      if (!coupon) return;
      this.selectedCoupon = coupon;
    }

    const view = this.buildView();
    if (this.selectedCoupon && view.couponInvalidReason) {
      Toast({
        context: this,
        selector: '#t-toast',
        message: couponView.REASON_TEXT[view.couponInvalidReason] || '此優惠券不可用',
        icon: '',
      });
      return;
    }

    this.payload.userCouponId = this.selectedCoupon ? this.selectedCoupon.userCouponId : null;
    this.payload.expectedTotalCents = view.totalCents;
    this.persistPayload();
    this.applyView(view, { couponVisible: false });
  },

  /** 讀取「我的」地址中的預設地址（mock 用 isDefault: 1／true） */
  async loadDefaultAddress() {
    try {
      const list = await fetchDeliveryAddressList();
      const defaultAddress = (list || []).find(
        (address) => address && (address.isDefault === 1 || address.isDefault === true),
      );
      if (defaultAddress) this.applyAddress(defaultAddress);
    } catch (err) {
      // 地址讀取失敗不該讓整頁無法顯示；使用者仍可手動選擇
      console.warn('[checkout] 讀取預設地址失敗', err);
    }
  },

  /** 地址 → 畫面欄位（兼容 mock 的兩種形狀） */
  applyAddress(address) {
    if (!address) return;
    const fullAddress =
      address.address ||
      [address.provinceName, address.cityName, address.districtName, address.detailAddress]
        .filter(Boolean)
        .join('');
    const phone = address.phoneNumber || address.phone || '';
    this.setData({
      address: {
        id: address.id || address.addressId || '',
        name: address.name || '',
        phone,
        fullAddress,
      },
    });
  },

  /** 選擇地址：沿用既有的 Promise 機制（地址列表會 resolveAddress） */
  onGotoAddress() {
    getAddressPromise()
      .then((address) => this.applyAddress(address))
      .catch(() => {});
    wx.navigateTo({ url: '/pages/user/address/list/index?selectMode=1&isOrderSure=1' });
  },

  onRetry() {
    this.load();
  },

  onBack() {
    wx.navigateBack({
      fail: () => wx.switchTab({ url: '/pages/cart/index' }),
    });
  },

  /** 提交（P7a：模擬成功） */
  onSubmit() {
    const { view, address, submitting } = this.data;
    if (submitting) return;

    if (!view || !view.ok) {
      Toast({ context: this, selector: '#t-toast', message: '有明細已失效，請返回重新選擇', icon: '' });
      return;
    }
    if (!address) {
      Toast({ context: this, selector: '#t-toast', message: '請選擇服務地址', icon: '' });
      return;
    }

    this.setData({ submitting: true });
    wx.showModal({
      title: '下單成功（模擬）',
      content: `合計 ¥${this.data.totalText}${
        view.discountCents > 0 ? `（已抵扣 ¥${this.data.discountText}）` : ''
      }。P7a 階段尚未串接支付與後端；正式下單與支付在 P5／P6。`,
      showCancel: false,
      success: () => {
        this.clearPurchasedCart();
        try {
          wx.removeStorageSync(checkoutView.CHECKOUT_KEY);
        } catch (err) {
          console.warn('[checkout] 清除結算資料失敗', err);
        }
        this.setData({ submitting: false });
        wx.switchTab({ url: '/pages/orders/index' });
      },
      fail: () => this.setData({ submitting: false }),
    });
  },

  /** 成功後移除已購買的購物車明細（只有 source='cart' 才有） */
  clearPurchasedCart() {
    if (!this.payload || this.payload.source !== 'cart') return;
    const lineIds = Array.isArray(this.payload.cartLineIds) ? this.payload.cartLineIds : [];
    if (lineIds.length === 0) return;

    const now = Date.now();
    let cart = cartRules.loadCart();
    for (const lineId of lineIds) {
      const result = cartRules.removeLine(cart, lineId, now);
      if (result.ok) cart = result.cart;
    }
    cartRules.saveCart(cart);
  },
});
