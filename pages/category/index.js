import Toast from 'tdesign-miniprogram/toast/index';
import { fetchCategories, fetchServices, fetchProducts } from '../../services/api/index';

const catalogView = require('../../utils/catalogView.js');

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

  /**
   * 點卡片。
   *
   * ⚠️ **過渡期**（與 T4 的購物車跳轉同一情況）：
   * - 零件 → 商品詳情（`productId`；**T6** 會把該頁的參數契約正式定為 `productId`）
   * - 服務 → 服務詳情頁**還不存在**（P7a-2b），**不導向錯誤的頁面**，只提示
   */
  onItemTap(e) {
    const card = e.detail && e.detail.goods;
    if (!card || !card.id) return;

    if (card.itemType === catalogView.ItemType.SERVICE) {
      Toast({ context: this, selector: '#t-toast', message: '服務詳情建置中', icon: '' });
      return;
    }
    wx.navigateTo({
      url: `/pages/goods/details/index?productId=${card.id}&spuId=${card.id}`,
    });
  },

  /** 載入失敗後的重試 */
  onRetry() {
    this.setData({ ready: false, loadError: false });
    this.load();
  },
});
