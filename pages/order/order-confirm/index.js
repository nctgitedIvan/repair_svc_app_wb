import Toast from 'tdesign-miniprogram/toast/index';
import dayjs from 'dayjs';
import { fetchProducts, fetchServices, fetchMyCoupons } from '../../../services/api/index';
import { fetchDeliveryAddressList } from '../../../services/address/fetchAddress';
import { getAddressPromise } from '../../../services/address/list';

const checkoutView = require('../../../utils/checkoutView.js');
const couponView = require('../../../utils/couponView.js');
const cartRules = require('../../../utils/cart.js');
const appointmentRules = require('../../../utils/appointment.js');

/** 優惠券日期顯示（只在畫面層格式化） */
const formatCouponDate = (ms) => (Number.isInteger(ms) ? dayjs(ms).format('YYYY-MM-DD') : '');

/** `Date` → `<picker mode="date">` 需要的 YYYY-MM-DD */
function formatDateInput(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

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
    /** 預約資訊（T3） */
    todayDate: '',
    appointmentDate: '',
    appointmentTime: '10:00',
    contactName: '',
    contactPhone: '',
    description: '',
    mediaUrls: [],
    mediaItems: [],
  },

  payload: null,
  products: [],
  services: [],
  coupons: [],
  selectedCoupon: null,

  onLoad() {
    const today = new Date();
    const tomorrow = new Date(today.getTime() + 86_400_000);

    this.setData({
      todayDate: formatDateInput(today),
      appointmentDate: formatDateInput(tomorrow),
      appointmentTime: '10:00',
    });

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

    // 還原上次填寫的預約表單（重新進入結算頁時不遺失）
    if (payload.appointmentInfo) {
      this.restoreAppointmentInfo(payload.appointmentInfo);
    }

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

  /** 把選券結果／預約資訊寫回結算 payload */
  persistPayload() {
    try {
      wx.setStorageSync(checkoutView.CHECKOUT_KEY, this.payload);
    } catch (err) {
      console.warn('[checkout] 儲存結算資料失敗', err);
    }
  },

  // ── 預約資訊（T3） ──

  restoreAppointmentInfo(info) {
    if (!info || !Number.isInteger(info.appointmentAt)) return;

    const mediaUrls = Array.isArray(info.mediaUrls) ? info.mediaUrls : [];
    this.setData({
      appointmentDate: dayjs(info.appointmentAt).format('YYYY-MM-DD'),
      appointmentTime: dayjs(info.appointmentAt).format('HH:mm'),
      contactName: info.contactName || '',
      contactPhone: info.contactPhone || '',
      description: info.description || '',
      mediaUrls,
      mediaItems: this.decorateMedia(mediaUrls),
    });
  },

  /** 附件 → 畫面資料；`audio:` 前綴代表語音 */
  decorateMedia(urls) {
    return (urls || []).map((url, index) => {
      if (url.startsWith('audio:')) {
        const seconds = Number(url.slice(6)) || 0;
        return {
          key: `audio-${index}-${url}`,
          type: 'audio',
          label: seconds > 0 ? `語音 ${seconds}″` : '語音附件',
          src: '',
        };
      }
      return { key: `image-${index}-${url}`, type: 'image', label: '照片', src: url };
    });
  },

  onAppointmentDateChange(e) {
    this.setData({ appointmentDate: e.detail.value });
  },

  onAppointmentTimeChange(e) {
    this.setData({ appointmentTime: e.detail.value });
  },

  onContactNameChange(e) {
    this.setData({ contactName: (e.detail && e.detail.value) || '' });
  },

  onContactPhoneChange(e) {
    this.setData({ contactPhone: (e.detail && e.detail.value) || '' });
  },

  onDescriptionChange(e) {
    this.setData({ description: (e.detail && e.detail.value) || '' });
  },

  choosePhotos() {
    const remain = 9 - this.data.mediaUrls.length;
    if (remain <= 0) {
      Toast({ context: this, selector: '#t-toast', message: '附件最多 9 個', icon: '' });
      return;
    }

    const onSuccess = (paths) => {
      if (!paths || paths.length === 0) return;
      const mediaUrls = [...this.data.mediaUrls, ...paths].slice(0, 9);
      this.setData({ mediaUrls, mediaItems: this.decorateMedia(mediaUrls) });
    };

    if (wx.chooseMedia) {
      wx.chooseMedia({
        count: remain,
        mediaType: ['image'],
        sourceType: ['album', 'camera'],
        sizeType: ['compressed'],
        success: (res) => {
          const paths = (res.tempFiles || []).map((file) => file.tempFilePath).filter(Boolean);
          onSuccess(paths);
        },
        fail: () => {},
      });
      return;
    }

    if (wx.chooseImage) {
      wx.chooseImage({
        count: remain,
        sizeType: ['compressed'],
        sourceType: ['album', 'camera'],
        success: (res) => onSuccess(res.tempFilePaths || []),
        fail: () => {},
      });
      return;
    }

    Toast({ context: this, selector: '#t-toast', message: '此版本不支援圖片上傳', icon: '' });
  },

  /** P7a 的錄音模擬：只存一個 `audio:3` 標記，P5 再換成真實音檔 */
  addSimulatedAudio() {
    if (this.data.mediaUrls.length >= 9) {
      Toast({ context: this, selector: '#t-toast', message: '附件最多 9 個', icon: '' });
      return;
    }

    const mediaUrls = [...this.data.mediaUrls, 'audio:3'];
    this.setData({ mediaUrls, mediaItems: this.decorateMedia(mediaUrls) });
    Toast({ context: this, selector: '#t-toast', message: '已加入模擬錄音（3 秒）', icon: '' });
  },

  removeMedia(e) {
    const index = Number(e.currentTarget.dataset.index);
    if (!Number.isInteger(index)) return;

    const mediaUrls = this.data.mediaUrls.filter((_, i) => i !== index);
    this.setData({ mediaUrls, mediaItems: this.decorateMedia(mediaUrls) });
  },

  onMediaTap(e) {
    const index = Number(e.currentTarget.dataset.index);
    const item = this.data.mediaItems[index];
    if (!item) return;

    if (item.type === 'image' && item.src) {
      wx.previewImage({ urls: [item.src], current: item.src });
      return;
    }
    Toast({ context: this, selector: '#t-toast', message: '語音附件將於 P5 支援播放', icon: '' });
  },

  /**
   * 把表單組成 AppointmentInfo 的純資料。
   * 回傳 `{ info }` 或 `{ error }`；頁面負責 Toast。
   */
  buildAppointmentInfo() {
    const {
      address,
      appointmentDate,
      appointmentTime,
      contactName,
      contactPhone,
      description,
      mediaUrls,
    } = this.data;

    return appointmentRules.buildAppointmentInfo({
      addressText: address && address.fullAddress,
      appointmentDate,
      appointmentTime,
      contactName,
      contactPhone,
      description,
      mediaUrls,
      now: Date.now(),
    });
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
    const contactUpdates = {};
    if (!this.data.contactName && address.name) contactUpdates.contactName = address.name;
    if (!this.data.contactPhone && phone) contactUpdates.contactPhone = phone;

    this.setData({
      address: {
        id: address.id || address.addressId || '',
        name: address.name || '',
        phone,
        fullAddress,
      },
      ...contactUpdates,
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

    const built = this.buildAppointmentInfo();
    if (built.error) {
      Toast({ context: this, selector: '#t-toast', message: built.error, icon: '' });
      return;
    }

    // 把預約表單寫進 checkout payload（P5 的 CreateOrder 直接讀這個欄位）
    this.payload.appointmentInfo = built.info;
    this.payload.appointmentAt = built.info.appointmentAt;
    this.persistPayload();

    const appointmentText = dayjs(built.info.appointmentAt).format('YYYY-MM-DD HH:mm');
    this.setData({ submitting: true });
    wx.showModal({
      title: '下單成功（模擬）',
      content: `預約時間 ${appointmentText}，聯絡人 ${built.info.contactName}。合計 ¥${
        this.data.totalText
      }${view.discountCents > 0 ? `（已抵扣 ¥${this.data.discountText}）` : ''}。P7a 階段尚未串接支付與後端；正式下單與支付在 P5／P6。`,
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
