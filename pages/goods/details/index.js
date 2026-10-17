import Toast from 'tdesign-miniprogram/toast/index';
import { fetchProductDetail, fetchServiceDetail } from '../../../services/api/index';

const detailView = require('../../../utils/detailView.js');
const favorite = require('../../../utils/favorite.js');
const inquiryRules = require('../../../utils/inquiry.js');
const cartRules = require('../../../utils/cart.js');
const { CartCode } = require('../../../utils/cartCodes.js');
const { ItemType } = require('../../../utils/catalogView.js');

/**
 * 詳情頁（**商品與服務共用**）。
 *
 * ## T6a 做了什麼（2026-10-17）
 *
 * 這一頁原本是完整的電商詳情頁，資料來自舊 mock（`model/good.js`）——
 * 而那個 mock 對 `prd-*` **查不到東西**，導致畫面顯示 ¥0.00、無圖、無規格
 * （見 `docs/P7a-2a-T3.6.1-診斷報告.md` §1.1）。
 *
 * T6a 把資料層換成新的 API，並移除沒有資料來源的電商區塊
 * （商品評價、領劵／優惠券、長圖詳情）。同時：
 * - **左下角**由「首頁／購物車」改為「**客服／收藏**」
 * - **右下角**移除「立即購買」（商品不得有立即下單，P7a2a-C2）
 * - 商品可加入購物車（無規格直接加、有規格開彈窗）
 * - 服務：顯示時長與技能標籤、**不進購物車**（§3.7.2）
 *
 * ## 資料流
 *
 * ```
 * fetchProductDetail / fetchServiceDetail（services/api）
 *        ↓
 * utils/detailView.js（純函式：view model ＋ 規格彈窗 model）
 *        ↓
 * 本頁（只負責事件、Toast、Storage 寫入）
 * ```
 *
 * ## ⚠️ 參數契約
 *
 * | 參數 | 用途 |
 * |---|---|
 * | `productId` | 商品（**正式**） |
 * | `serviceId` | 服務（T6a 新增） |
 * | `spuId` | **過渡期相容**：T4／T3.6 目前同時帶它，值與 `productId` 相同 |
 *
 * 「立即預約」與「加購零件」屬 **P7a-2b**（依賴 T7 的結算頁），本頁先不提供。
 */

/** 收藏星星的兩種狀態（iconfont 本來就有空心／實心兩顆，見 style/iconfont.wxss） */
const FAVORITE_ICON = {
  off: { name: 'star', color: '#BBBBBB' }, // 空心、灰
  on: { name: 'star_filled', color: '#FFA500' }, // 實心、橙黃
};

/**
 * 左下角入口。⚠️ 傳 action key，不是 url（見 buy-bar 的說明）
 *
 * T6a.1-3：收藏的**圖示與顏色由這裡決定**（資料驅動），
 * buy-bar 只負責照著畫 —— 這樣通用元件不必知道「收藏」是什麼。
 */
function buildJumpArray({ isFavorite, canFavorite }) {
  const list = [{ key: 'cs', title: '客服', iconName: 'service', iconColor: '' }];
  if (canFavorite) {
    const icon = isFavorite ? FAVORITE_ICON.on : FAVORITE_ICON.off;
    list.push({
      key: 'favorite',
      title: isFavorite ? '已收藏' : '收藏',
      iconName: icon.name,
      iconColor: icon.color,
    });
  }
  return list;
}

Page({
  /** 規格彈窗的來源：`'cart'`（加入購物車）或 `'buy-now'`（立即購買） */
  specAction: 'cart',

  /** 原始項目（加入購物車與收藏時要 name／priceCents／thumb） */
  item: null,
  /** 收藏資料（本機 Storage） */
  favoriteStore: null,
  /** 規格彈窗回報的 { [維度id]: 選中的規格值 } */
  selectedSku: {},

  data: {
    ready: false,
    /** 查不到商品（見 T3.6.1：不再讓整頁停在初始空白狀態） */
    loadFailed: false,
    /** `utils/detailView.buildDetailView()` 的結果 */
    detail: {},
    isFavorite: false,
    jumpArray: [],
    /** 1 = 顯示「加入購物車」（商品且上架有庫存）；0 = 不顯示（服務／售完／下架） */
    buttonType: 0,
    soldout: false,
    isStock: true,
    // ── 規格彈窗 ──
    isSpecsPopupShow: false,
    specList: [],
    skuList: [],
    buyNum: 1,
    selectedAttrStr: '',
    // ── 詢問彈窗（T6b） ──
    isInquiryPopupShow: false,
    /** 規格彈窗的按鈕文字（T7：加入購物車／立即購買） */
    specConfirmText: '加入購物車',
  },

  onLoad(query) {
    const serviceId = query.serviceId;
    const productId = query.productId || query.spuId;
    this.favoriteStore = favorite.loadFavorites();

    if (serviceId) {
      this.loadService(serviceId);
    } else if (productId) {
      this.loadProduct(productId);
    } else {
      // 連 id 都沒有（例如舊的 order 頁帶 skuId）→ 明確告知
      this.setData({ ready: true, loadFailed: true });
    }
  },

  /** 商品 */
  async loadProduct(productId) {
    try {
      const product = await fetchProductDetail(productId);
      this.item = { ...product, itemType: ItemType.PRODUCT };
      this.applyDetail(detailView.buildDetailView({ item: product, itemType: ItemType.PRODUCT }));
    } catch (err) {
      this.onLoadFailed(err);
    }
  },

  /** 服務（顯示層；預約與加購零件屬 P7a-2b） */
  async loadService(serviceId) {
    try {
      const { service } = await fetchServiceDetail(serviceId);
      this.item = { ...service, itemType: ItemType.SERVICE };
      this.applyDetail(detailView.buildDetailView({ item: service, itemType: ItemType.SERVICE }));
    } catch (err) {
      this.onLoadFailed(err);
    }
  },

  onLoadFailed(err) {
    console.warn('[details] 查不到項目資料', err);
    this.item = null;
    this.setData({ ready: true, loadFailed: true });
  },

  /** 把 view model 套進畫面 */
  applyDetail(detail) {
    const isFavorite = detail ? favorite.isFavorite(this.favoriteStore, detail.id) : false;
    this.setData({
      ready: true,
      loadFailed: !detail,
      detail: detail || {},
      isFavorite,
      // 收藏只服務「商品」—— `favorites` 集合的鍵是 product_id（docs/01 §7.2 第 9 點）
      jumpArray: buildJumpArray({ isFavorite, canFavorite: detail.itemType === ItemType.PRODUCT }),
      buttonType: detail.showBuyButtons ? 1 : 0,
      soldout: detail.isDelisted,
      isStock: !detail.isSoldOut && !detail.isDelisted,
    });
  },

  /** 「商品查不到」畫面按「返回」 */
  onLoadFailedBack() {
    wx.navigateBack({
      fail: () => wx.switchTab({ url: '/pages/category/index' }),
    });
  },

  // ── 左下角入口（客服／收藏） ──

  onBuyBarNav(e) {
    const { key } = e.detail || {};
    if (key === 'favorite') {
      this.onToggleFavorite();
      return;
    }
    if (key === 'cs') {
      this.openInquiry();
      return;
    }
    // 保留支援舊的 url 型入口（其他頁面日後若複用這個元件）
    const target = { home: '/pages/home/home', cart: '/pages/cart/index' }[key];
    if (target) wx.switchTab({ url: target });
  },

  onToggleFavorite() {
    const { detail } = this.data;
    if (!detail.id) return;

    const result = favorite.toggleFavorite(this.favoriteStore || favorite.loadFavorites(), {
      productId: detail.id,
      item: this.item,
      now: Date.now(),
    });

    if (!result.ok) {
      const message =
        result.code === favorite.FavoriteCode.LIMIT_EXCEEDED ? '收藏已達上限' : '收藏失敗，請稍後再試';
      Toast({ context: this, selector: '#t-toast', message, icon: '' });
      return;
    }

    this.favoriteStore = result.store;
    if (!favorite.saveFavorites(result.store)) {
      Toast({ context: this, selector: '#t-toast', message: '儲存失敗，請稍後再試', icon: '' });
      return;
    }

    const favorited = result.favorited;
    this.setData({
      isFavorite: favorited,
      jumpArray: buildJumpArray({ isFavorite: favorited, canFavorite: true }),
    });
    Toast({ context: this, selector: '#t-toast', message: favorited ? '已加入收藏' : '已取消收藏', icon: '' });
  },

  // ── 客服詢問（T6b） ──

  /**
   * 開啟詢問彈窗。
   *
   * ⚠️ `inquiries` 的鍵是 `product_id`（docs/01 §7.2 第 8 點）——
   *    服務的詢問不在 P7a 範圍（schema 需擴充 item_type/item_id），先給明確提示。
   */
  openInquiry() {
    const { detail } = this.data;
    if (!detail.id) return;
    if (detail.itemType !== ItemType.PRODUCT) {
      Toast({ context: this, selector: '#t-toast', message: '服務詢問建置中（P5）', icon: '' });
      return;
    }
    this.setData({ isInquiryPopupShow: true });
  },

  onInquiryClose() {
    this.setData({ isInquiryPopupShow: false });
  },

  /** 寫入本機 Storage（P7a）；P5 接上後改由後端 CreateInquiry 處理 */
  onInquirySubmit(e) {
    const { detail } = this.data;
    const { message } = e.detail || {};

    const result = inquiryRules.addInquiry(inquiryRules.loadInquiries(), {
      productId: detail.id,
      item: this.item,
      message,
      now: Date.now(),
    });

    if (!result.ok) {
      const text =
        result.code === inquiryRules.InquiryCode.LIMIT_EXCEEDED
          ? '詢問數量已達上限'
          : '送出失敗，請稍後再試';
      Toast({ context: this, selector: '#t-toast', message: text, icon: '' });
      return;
    }

    if (!inquiryRules.saveInquiries(result.store)) {
      Toast({ context: this, selector: '#t-toast', message: '儲存失敗，請稍後再試', icon: '' });
      return;
    }

    this.setData({ isInquiryPopupShow: false });
    Toast({ context: this, selector: '#t-toast', message: '已送出詢問', icon: '' });
  },

  /**
   * 「立即購買／立即預約」＝ **跳過購物車、直接進結算**（T7）。
   *
   * - 商品、無規格：直接寫 payload → 結算頁
   * - 商品、有規格：開規格彈窗（按鈕文字「立即購買」），選好 SKU 後再進結算
   * - 服務：寫服務 payload（預約時間佔位）→ 結算頁
   */
  onBuyNow() {
    const { detail } = this.data;
    if (!detail.id) return;

    if (detail.itemType === ItemType.SERVICE) {
      if (detail.isDelisted) return;
      this.goServiceCheckout();
      return;
    }

    if (!detail.canAddToCart) return;

    if (!detail.hasSpecs) {
      this.goProductCheckout(null, 1);
      return;
    }

    const model = detailView.toSpecPopupModel({ item: this.item, itemType: this.item.itemType });
    if (!model) {
      this.goProductCheckout(null, 1);
      return;
    }

    this.specAction = 'buy-now';
    this.selectedSku = {};
    this.baseMaxBuyQuantity = detail.maxBuyQuantity;
    this.setData({
      isSpecsPopupShow: true,
      specList: model.specList,
      skuList: model.skuList,
      buyNum: 1,
      selectedAttrStr: '',
      specConfirmText: '立即購買',
    });
  },

  /** 商品（單筆）→ 結算 payload */
  goProductCheckout(sku, quantity) {
    const { detail } = this.data;
    const unitPriceCents =
      sku && Number.isInteger(sku.priceCents) ? sku.priceCents : detail.priceCents;
    const payload = {
      source: 'buy-now',
      orderType: 'product',
      items: [
        {
          itemType: 'product',
          itemId: detail.id,
          skuId: sku ? sku.skuId : null,
          quantity,
        },
      ],
      expectedTotalCents: unitPriceCents * quantity,
      cartLineIds: [],
      addressId: null,
      appointmentAt: null,
    };
    this.goCheckout(payload);
  },

  /** 服務（單筆）→ 結算 payload；預約時間由 P7a-2b 補上 */
  goServiceCheckout() {
    const { detail } = this.data;
    const payload = {
      source: 'service',
      orderType: 'service',
      items: [{ itemType: 'service', itemId: detail.id, quantity: 1 }],
      expectedTotalCents: Number.isInteger(detail.priceCents) ? detail.priceCents : 0,
      cartLineIds: [],
      addressId: null,
      appointmentAt: null,
    };
    this.goCheckout(payload);
  },

  /** 寫入統一的結算 payload，導向結算頁 */
  goCheckout(payload) {
    try {
      wx.setStorageSync(cartRules.CHECKOUT_KEY, JSON.stringify(payload));
    } catch (err) {
      console.warn('[details] 寫入結算資料失敗', err);
      Toast({ context: this, selector: '#t-toast', message: '無法前往結算，請稍後再試', icon: '' });
      return;
    }
    wx.navigateTo({ url: '/pages/order/order-confirm/index' });
  },

  // ── 加入購物車 ──

  /**
   * 按「加入購物車」。
   *
   * - **無規格** → 直接加入（不必開彈窗問一個只有一個選項的問題）
   * - **有規格** → 開彈窗選規格
   *
   * 這個分流規則住在 `utils/detailView.toSpecPopupModel()`（無規格回 `null`），
   * 頁面只負責照結果執行。
   */
  onAddToCart() {
    const { detail } = this.data;
    if (!detail.id || !detail.canAddToCart) return;

    const model = detailView.toSpecPopupModel({ item: this.item, itemType: this.item.itemType });
    if (!model) {
      this.commitAddToCart(null, 1);
      return;
    }

    this.selectedSku = {};
    this.specAction = 'cart';
    // 未選完規格時的上限（buildDetailView 算出的「所有 SKU 最大庫存」）
    this.baseMaxBuyQuantity = detail.maxBuyQuantity;
    this.setData({
      isSpecsPopupShow: true,
      specList: model.specList,
      skuList: model.skuList,
      buyNum: 1,
      selectedAttrStr: '',
      specConfirmText: '加入購物車',
    });
  },

  /** 彈窗內選了規格 */
  onSpecChange(e) {
    const { selectedSku, specList } = e.detail || {};
    this.selectedSku = selectedSku || {};
    // 已選規格的顯示文字（彈窗與列表頁共用同一個字串）
    const names = [];
    (specList || []).forEach((spec) => {
      (spec.specValueList || []).forEach((value) => {
        if (value.isSelected) names.push(value.specValue);
      });
    });

    // ⚠️ T6a.3-3：選中 SKU 後，數量上限收斂成「該 SKU 的庫存」。
    // 未選完／組合不存在時還原成開啟彈窗時的基準（所有 SKU 的最大庫存）。
    const sku = detailView.findSkuBySelection({
      specs: (this.item && this.item.specs) || [],
      skus: (this.item && this.item.skus) || [],
      selectedSku: this.selectedSku,
    });
    const skuStock = sku ? detailView.stockOfSku(this.item.skus, sku.skuId) : null;
    const maxBuyQuantity =
      skuStock === null
        ? this.baseMaxBuyQuantity
        : Math.min(skuStock, detailView.MAX_BUY_QUANTITY);
    // 已選的數量可能大於新上限（例如 20 → 8），一併夾住
    const buyNum = Math.max(1, Math.min(this.data.buyNum, maxBuyQuantity));

    this.setData({
      selectedAttrStr: names.join('、'),
      'detail.maxBuyQuantity': maxBuyQuantity,
      buyNum,
    });
  },

  onBuyNumChange(e) {
    this.setData({ buyNum: e.detail.buyNum });
  },

  /** 彈窗內按「加入購物車」 */
  onPopupAddCart() {
    const { detail } = this.data;
    let sku = null;
    if (detail.hasSpecs) {
      // T6a.3-3：購物車存的是 **skuId**（不是第一個維度的規格值）
      sku = detailView.findSkuBySelection({
        specs: (this.item && this.item.specs) || [],
        skus: (this.item && this.item.skus) || [],
        selectedSku: this.selectedSku,
      });
      if (!sku) {
        Toast({ context: this, selector: '#t-toast', message: '請先選擇規格', icon: '' });
        return;
      }
    }
    // T7：同一個彈窗支援「加入購物車」與「立即購買」
    if (this.specAction === 'buy-now') {
      this.goProductCheckout(sku, this.data.buyNum);
      return;
    }
    this.commitAddToCart(sku ? sku.skuId : null, this.data.buyNum, sku);
  },

  /**
   * 實際寫入購物車。
   *
   * ⚠️ 規則一律交給 `utils/cart.js`（它也會擋下服務、超上限、數量不合法）——
   *    本頁不重複實作。
   *
   * ⚠️ T6a.3-3：有規格時 `specId` 存的是 **skuId**（lineId 會是 `prd-1:sku-std`），
   *    單價用該 SKU 的價格（例：大罐 4800），不是商品層的展示起價。
   */
  commitAddToCart(skuId, quantity, sku) {
    const { detail } = this.data;
    const priceCents = sku && Number.isInteger(sku.priceCents) ? sku.priceCents : detail.priceCents;
    const result = cartRules.addItem(
      cartRules.loadCart(),
      {
        itemType: 'product',
        productId: detail.id,
        specId: skuId || null,
        quantity,
        priceCents,
      },
      Date.now(),
    );

    if (!result.ok) {
      const message =
        result.code === CartCode.LIMIT_EXCEEDED ? '購物車已滿（上限 50 項）' : '加入購物車失敗';
      Toast({ context: this, selector: '#t-toast', message, icon: '' });
      return;
    }

    if (!cartRules.saveCart(result.cart)) {
      Toast({ context: this, selector: '#t-toast', message: '儲存失敗，請稍後再試', icon: '' });
      return;
    }

    this.setData({ isSpecsPopupShow: false });
    Toast({ context: this, selector: '#t-toast', message: '已加入購物車', icon: '' });
  },

  onSpecsPopupHide() {
    this.specAction = 'cart';
    this.setData({ isSpecsPopupShow: false });
  },

  /** 分享（微信原生） */
  onShareAppMessage() {
    const { detail } = this.data;
    return {
      title: detail.title || '維修服務平台',
      path: detail.itemType === ItemType.SERVICE
        ? `/pages/goods/details/index?serviceId=${detail.id}`
        : `/pages/goods/details/index?productId=${detail.id}`,
    };
  },
});
