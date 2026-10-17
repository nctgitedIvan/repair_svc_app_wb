import Toast from 'tdesign-miniprogram/toast/index';
import { fetchProducts, fetchServices } from '../../../services/api/index';
import { fetchDeliveryAddressList } from '../../../services/address/fetchAddress';
import { getAddressPromise } from '../../../services/address/list';

const checkoutView = require('../../../utils/checkoutView.js');
const cartRules = require('../../../utils/cart.js');

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
 * 材料費（商品）＋ 服務費（服務）＝ 商品總額／合計。
 * payload 的 `expectedTotalCents` 只用來偵測「價格已更新」。
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
  },

  payload: null,

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
      const [products, services] = await Promise.all([fetchProducts(), fetchServices()]);
      const view = checkoutView.buildCheckoutView({
        payload,
        products: products.list,
        services: services.list,
      });

      this.setData({
        ready: true,
        loading: false,
        view,
        orderTypeLabel: ORDER_TYPE_LABEL[view.orderType] || '',
      });

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
      content: 'P7a 階段尚未串接支付與後端；正式下單與支付在 P5／P6。',
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
