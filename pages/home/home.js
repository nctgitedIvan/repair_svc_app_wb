import Toast from 'tdesign-miniprogram/toast/index';
import { fetchHome, fetchProducts, fetchServices } from '../../services/api/index';

const catalogView = require('../../utils/catalogView.js');
const cartRules = require('../../utils/cart.js');
const { CartCode } = require('../../utils/cartCodes.js');

/** 每次載入的卡片數（沿用原版首頁的 TDesign 列表節奏） */
const PAGE_SIZE = 10;

/**
 * 首頁（原版 TDesign 零售版型 ＋ 維修平台資料）。
 *
 * ## 版面（刻意還原 P8 之前的 TDesign 結構）
 *
 * ```
 * 搜尋框 → Banner 輪播 → 金剛區（快捷入口）
 *   → Tabs（常用零件／熱門服務）→ catalog-card 卡片 → load-more
 * ```
 *
 * ## 資料來源（紅線）
 *
 * 全部走 `services/api`：
 * - `fetchHome()`       → Banner／快捷入口
 * - `fetchProducts()`   → 零件卡片（常用零件）
 * - `fetchServices()`   → 服務卡片（熱門服務）
 *
 * 卡片一律由 `catalogView.toCardModel()` 產生，與分類頁／商品列表頁**同一套**
 * 呈現資料（`docs/01` §3.7.0、§3.7.10）。頁面不寫死任何商品或價格。
 *
 * ⚠️ 舊電商的 `fetchGoodsList`／`model/good`／促銷 tabs 一律不再使用。
 */
Page({
  data: {
    imgSrcs: [],
    quickEntries: [],
    tabList: [
      { text: '常用零件', key: 0 },
      { text: '熱門服務', key: 1 },
    ],
    goodsList: [],
    goodsListLoadStatus: 0,
    pageLoading: false,
    catalogLoading: false,
    catalogLoaded: false,
    loadError: false,
    current: 1,
    autoplay: true,
    duration: '500',
    interval: 5000,
    navigation: { type: 'dots' },
    swiperImageProps: { mode: 'scaleToFill' },
  },

  /** 兩個 tab 的完整卡片來源（不進 data，避免每次渲染搬整份目錄） */
  tabCards: [[], []],
  /** 每個 tab 已載入的卡片數（本機分頁） */
  tabLoaded: [0, 0],
  /** 目前 tab（0 = 常用零件、1 = 熱門服務） */
  currentTab: 0,

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

  onReachBottom() {
    if (this.data.goodsListLoadStatus === 0 && this.data.goodsList.length > 0) {
      this.renderTab(false);
    }
  },

  init() {
    this.loadHomePage();
    this.loadCatalog();
  },

  /** Banner／公告／快捷入口 */
  loadHomePage() {
    this.setData({ pageLoading: true });

    fetchHome()
      .then(({ swiper, quickEntries }) => {
        this.setData({
          imgSrcs: swiper || [],
          quickEntries: quickEntries || [],
          pageLoading: false,
        });
      })
      .catch((err) => {
        console.warn('[home] 載入首頁資料失敗', err);
        this.setData({ pageLoading: false });
      })
      .then(() => wx.stopPullDownRefresh());
  },

  /** 目錄：零件與服務一次抓完，之後只在本機切 tab／分頁 */
  async loadCatalog() {
    this.setData({ catalogLoading: true, loadError: false });
    try {
      const [products, services] = await Promise.all([fetchProducts(), fetchServices()]);
      const cards = catalogView
        .mergeCatalog({ services: services.list, products: products.list })
        .map((item) => catalogView.toCardModel(item))
        .filter(Boolean);

      this.tabCards = [
        cards.filter((card) => card.itemType === catalogView.ItemType.PRODUCT),
        cards.filter((card) => card.itemType === catalogView.ItemType.SERVICE),
      ];
      this.tabLoaded = [0, 0];
      this.currentTab = 0;

      this.renderTab(true);
      this.setData({ catalogLoading: false, catalogLoaded: true, loadError: false });
    } catch (err) {
      console.warn('[home] 載入目錄失敗', err);
      this.setData({
        catalogLoading: false,
        catalogLoaded: true,
        loadError: true,
        goodsList: [],
        goodsListLoadStatus: 3,
      });
      Toast({ context: this, selector: '#t-toast', message: '首頁載入失敗，請稍後再試', icon: '' });
    }
  },

  /** 渲染目前 tab 的下一頁；`fresh` 為 true 時從第一頁重來 */
  renderTab(fresh) {
    const cards = this.tabCards[this.currentTab] || [];
    if (fresh) this.tabLoaded[this.currentTab] = 0;

    const start = this.tabLoaded[this.currentTab];
    const next = cards.slice(start, start + PAGE_SIZE);
    this.tabLoaded[this.currentTab] = start + next.length;

    this.setData({
      goodsList: fresh ? next : this.data.goodsList.concat(next),
      goodsListLoadStatus: this.tabLoaded[this.currentTab] >= cards.length ? 2 : 0,
    });
  },

  tabChangeHandle(e) {
    const tabIndex = Number(e.detail && e.detail.value);
    if (![0, 1].includes(tabIndex) || tabIndex === this.currentTab) return;

    this.currentTab = tabIndex;
    wx.pageScrollTo({ scrollTop: 0 });
    this.renderTab(true);
  },

  onReTry() {
    this.loadCatalog();
  },

  /** 點卡片 → 詳情頁（參數與分類頁／商品列表頁一致） */
  goodListClickHandle(e) {
    const index = Number(e.currentTarget.dataset.index);
    const card = this.data.goodsList[index];
    if (!card || !card.id) return;

    const param =
      card.itemType === catalogView.ItemType.SERVICE
        ? `serviceId=${card.id}`
        : `productId=${card.id}`;
    wx.navigateTo({ url: `/pages/goods/details/index?${param}` });
  },

  /** 卡片加購：與分類頁／商品列表頁同一套規則 */
  goodListAddCartHandle(e) {
    const index = Number(e.currentTarget.dataset.index);
    const card = this.data.goodsList[index];
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

  onQuickEntryTap(e) {
    const { key } = e.currentTarget.dataset;
    const tabRoutes = {
      category: '/pages/category/index',
      cart: '/pages/cart/index',
      orders: '/pages/orders/index',
    };
    if (tabRoutes[key]) {
      wx.switchTab({ url: tabRoutes[key] });
      return;
    }
    if (key === 'favorites') {
      wx.navigateTo({ url: '/pages/user/favorites/index' });
    }
  },

  navToSearchPage() {
    wx.navigateTo({ url: '/pages/goods/list/index' });
  },
});
