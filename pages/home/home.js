import Toast from 'tdesign-miniprogram/toast/index';
import { fetchHome } from '../../services/home/home';
import { fetchProducts, fetchServices } from '../../services/api/index';

const catalogView = require('../../utils/catalogView.js');
const cartRules = require('../../utils/cart.js');
const { CartCode } = require('../../utils/cartCodes.js');

/**
 * 首頁（P8 資料一致性修正）。
 *
 * ## 資料來源
 *
 * 與分類頁、商品列表頁**完全相同**：
 * `fetchProducts`／`fetchServices` → `catalogView.mergeCatalog` → `toCardModel`。
 *
 * 不再使用舊電商的 `fetchGoodsList`（model/good），也移除舊的促銷 tabs。
 * 常用零件在上、熱門服務在下（`docs/01` §3.7.0）。
 */
Page({
  data: {
    imgSrcs: [],
    productItems: [],
    serviceItems: [],
    pageLoading: false,
    catalogLoading: false,
    loadError: false,
    current: 1,
    autoplay: true,
    duration: '500',
    interval: 5000,
    navigation: { type: 'dots' },
    swiperImageProps: { mode: 'scaleToFill' },
  },

  onShow() {
    const tabBar = this.getTabBar && this.getTabBar();
    if (tabBar) tabBar.init();
  },

  onLoad() {
    this.init();
  },

  onPullDownRefresh() {
    this.init();
  },

  init() {
    this.loadHomePage();
    this.loadCatalog();
  },

  loadHomePage() {
    wx.stopPullDownRefresh();
    this.setData({ pageLoading: true });

    fetchHome()
      .then(({ swiper }) => {
        this.setData({ imgSrcs: swiper || [], pageLoading: false });
      })
      .catch(() => {
        this.setData({ pageLoading: false });
      });
  },

  async loadCatalog() {
    this.setData({ catalogLoading: true, loadError: false });
    try {
      const [products, services] = await Promise.all([fetchProducts(), fetchServices()]);
      const merged = catalogView.mergeCatalog({
        services: services.list,
        products: products.list,
      });
      const cards = merged.map((item) => catalogView.toCardModel(item)).filter(Boolean);

      this.setData({
        catalogLoading: false,
        productItems: cards.filter((card) => card.itemType === catalogView.ItemType.PRODUCT).slice(0, 6),
        serviceItems: cards.filter((card) => card.itemType === catalogView.ItemType.SERVICE).slice(0, 6),
      });
    } catch (err) {
      console.warn('[home] 載入目錄失敗', err);
      this.setData({ catalogLoading: false, loadError: true });
      Toast({ context: this, selector: '#t-toast', message: '首頁載入失敗，請稍後再試', icon: '' });
    }
  },

  cardAt(e) {
    const { list, index } = e.currentTarget.dataset;
    const source = list === 'service' ? this.data.serviceItems : this.data.productItems;
    const card = source[Number(index)];
    return card || null;
  },

  /** 點卡片 → 詳情頁（參數與分類頁／列表頁一致） */
  onCardTap(e) {
    const card = this.cardAt(e);
    if (!card || !card.id) return;
    const param =
      card.itemType === catalogView.ItemType.SERVICE
        ? `serviceId=${card.id}`
        : `productId=${card.id}`;
    wx.navigateTo({ url: `/pages/goods/details/index?${param}` });
  },

  /** 卡片加購：與分類頁／列表頁同一套規則 */
  onAddCart(e) {
    const card = this.cardAt(e);
    const action = catalogView.addActionFor(card);
    if (!action) return;

    if (action === catalogView.AddAction.SERVICE) {
      Toast({ context: this, selector: '#t-toast', message: '服務請直接下單，無需加入購物車', icon: '' });
      return;
    }
    if (action === catalogView.AddAction.SOLD_OUT) {
      Toast({ context: this, selector: '#t-toast', message: '此商品已售完', icon: '' });
      return;
    }
    if (action === catalogView.AddAction.CHOOSE_SPEC) {
      wx.navigateTo({ url: `/pages/goods/details/index?productId=${card.id}` });
      return;
    }

    const result = cartRules.addItem(
      cartRules.loadCart(),
      {
        itemType: 'product',
        productId: card.id,
        specId: null,
        quantity: 1,
        priceCents: card.price,
      },
      Date.now(),
    );

    if (!result.ok) {
      const message = result.code === CartCode.LIMIT_EXCEEDED ? '購物車已滿（上限 50 項）' : '加入購物車失敗';
      Toast({ context: this, selector: '#t-toast', message, icon: '' });
      return;
    }
    if (!cartRules.saveCart(result.cart)) {
      Toast({ context: this, selector: '#t-toast', message: '儲存失敗，請稍後再試', icon: '' });
      return;
    }
    Toast({ context: this, selector: '#t-toast', message: '已加入購物車', icon: '' });
  },

  navToSearchPage() {
    wx.navigateTo({ url: '/pages/goods/search/index' });
  },
});
