import Toast from 'tdesign-miniprogram/toast/index';
import { fetchCategories, fetchServices, fetchProducts } from '../../services/api/index';

const catalogView = require('../../utils/catalogView.js');
const cartRules = require('../../utils/cart.js');
const { CartCode } = require('../../utils/cartCodes.js');

/**
 * 分類頁（tabBar 第 2 項，標題「分類」）。
 *
 * ## 這一頁不是新寫的
 *
 * 版面用的是 **TDesign 原始的分類頁**（`goods-category` 元件：左側一級側邊欄 ＋
 * 右側二級 tabs ＋ 下方網格），它從 baseline 以來一直在 repo 裡沒被改過 ——
 * P7a-1 只是把 tabBar 指向了新建的骨架 `pages/services/index`，T3.5 又只改了文字，
 * 才出現「tabBar 寫分類、點進去是空殼」。
 * T3.6 把 tabBar 指回本頁，並把資料源從舊電商 mock 換成新的 API 層。
 *
 * ## 版面配置
 *
 * ```
 * ┌────────┬──────────────────────────────┐
 * │ 一級   │ 二級 tabs（c-tabbar）         │
 * │ 水     ├──────────────────────────────┤
 * │ 電     │ 服務 + 零件（兩列網格）        │
 * │ 空調   │                              │
 * │ 家具   │                              │
 * └────────┴──────────────────────────────┘
 * ```
 *
 * 一級／二級之間的切換由 `goods-category` 元件自己維護 `activeKey`，
 * 它會用 `change` 事件把 `[一級索引, 二級索引]` 丟上來；本頁依索引取網格資料。
 *
 * ## ⚠️ 本頁不判斷規則
 *
 * 「哪些分類要顯示」「服務在上零件在下」「卡片要什麼欄位」全在
 * `utils/catalogView.js`（純函式，有測試）。本頁只做三件事：
 * 抓資料、依索引取子集合、導覽。
 */

Page({
  /** 抓下來的目錄（`{ services, products }`）—— 切分頁時重複使用，不重打 API */
  catalog: null,

  data: {
    ready: false,
    /** 目錄取不到（後端未就緒／離線）—— 顯示重試入口，不假裝「沒有分類」 */
    loadError: false,
    /** `goods-category` 要的兩層樹 */
    levels: [],
    /** 目前二級分類下的卡片（服務在上、零件在下） */
    items: [],
    /** 目前選取的一級／二級索引 */
    activeKey: 0,
    subActiveKey: 0,
    /** 目前二級分類的名稱（空清單時顯示用） */
    currentName: '',
  },

  onLoad() {
    this.load();
  },

  onShow() {
    const tabBar = this.getTabBar && this.getTabBar();
    if (tabBar) tabBar.init();
  },

  async load() {
    try {
      const [categories, services, products] = await Promise.all([
        fetchCategories(),
        fetchServices(),
        fetchProducts(),
      ]);
      this.catalog = { services: services.list, products: products.list };

      const levels = catalogView.buildCategoryTree(categories.list);
      this.setData({ ready: true, loadError: false, levels }, () => {
        this.refreshItems(0, 0);
      });
    } catch (err) {
      // 與購物車同一原則：失敗時給重試入口，不假裝「沒有分類」
      console.warn('[category] 載入目錄失敗', err);
      this.catalog = null;
      this.setData({ ready: true, loadError: true, levels: [], items: [] });
      Toast({ context: this, selector: '#t-toast', message: '分類載入失敗，請稍後再試' });
    }
  },

  /** `goods-category` 丟上來的 `[一級索引, 二級索引]` */
  onCategoryChange(e) {
    const [activeKey, subActiveKey] = e.detail || [];
    this.refreshItems(activeKey || 0, subActiveKey || 0);
  },

  /** 依索引取該二級分類下的卡片 */
  refreshItems(activeKey, subActiveKey) {
    const parent = this.data.levels[activeKey];
    const child = parent && parent.children[subActiveKey];
    if (!this.catalog || !child) {
      this.setData({ items: [], activeKey, subActiveKey, currentName: parent ? parent.name : '' });
      return;
    }

    const items = catalogView
      .mergeByCategory({ ...this.catalog, categoryId: child.categoryId })
      .map((item) => catalogView.toCardModel(item));

    this.setData({ items, activeKey, subActiveKey, currentName: child.name });
  },

  /** 從 `data-index` 取回卡片（T6a.1-2：卡片由本頁渲染，不再依賴元件的 payload） */
  cardAt(e) {
    const index = Number(e.currentTarget.dataset.index);
    return Number.isInteger(index) ? this.data.items[index] : null;
  },

  /**
   * 點卡片 → 詳情頁。
   *
   * 服務與商品現在**共用同一個詳情頁**（T6a），因此只是參數不同：
   * 商品帶 `productId`（＋過渡期的 `spuId`）、服務帶 `serviceId`。
   */
  onItemTap(e) {
    const card = this.cardAt(e);
    if (!card || !card.id) return;

    const param =
      card.itemType === catalogView.ItemType.SERVICE
        ? `serviceId=${card.id}`
        : `productId=${card.id}`;
    wx.navigateTo({ url: `/pages/goods/details/index?${param}` });
  },

  /**
   * 卡片上的「加入購物車」。
   *
   * 分流規則在 `utils/catalogView.addActionFor()`（純函式，有測試）——
   * 本頁只負責照結果執行：
   *
   * | 情況 | 行為 |
   * |---|---|
   * | 零件、無規格 | 直接寫入本機購物車 |
   * | 零件、有規格 | **導向商品詳情選規格**（T5-3／M8；T6a 已完成） |
   * | 零件、整件售完 | Toast「已售完」（T5-3） |
   * | 服務 | Toast 提示（§3.7.2：服務永遠不進購物車） |
   */
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
      // T6a 已完成：詳情頁可以選規格並加入購物車
      wx.navigateTo({ url: `/pages/goods/details/index?productId=${card.id}` });
      return;
    }

    // ADD：無規格的零件 —— 加一筆進購物車
    const cart = cartRules.loadCart();
    const result = cartRules.addItem(
      cart,
      {
        itemType: 'product',
        productId: card.id,
        specId: null,
        quantity: 1,
        priceCents: card.price, // 卡片 model 的 price 就是「分」
      },
      Date.now(),
    );

    if (!result.ok) {
      // 上限或數量不合法（`utils/cart.js` 的規則）
      const message = result.code === CartCode.LIMIT_EXCEEDED ? '購物車已滿（上限 50 項）' : '加入購物車失敗';
      Toast({ context: this, selector: '#t-toast', message, icon: '' });
      return;
    }
    cartRules.saveCart(result.cart);
    Toast({ context: this, selector: '#t-toast', message: '已加入購物車', icon: '' });
  },

  /** 載入失敗後的重試 */
  onRetry() {
    this.setData({ ready: false, loadError: false });
    this.load();
  },
});
