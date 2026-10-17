import Toast from 'tdesign-miniprogram/toast/index';
import { fetchCategories, fetchServices, fetchProducts } from '../../../services/api/index';

const catalogView = require('../../../utils/catalogView.js');
const cartRules = require('../../../utils/cart.js');
const { CartCode } = require('../../../utils/cartCodes.js');

/**
 * 商品列表（服務＋零件，T5）。
 *
 * ## 這一頁不是「分類頁」的替代品
 *
 * - `pages/category`：左側一級／右側二級 tabs，**以分類為入口**（服務在上）
 * - 本頁：**以清單為入口**（搜尋／排序／價格區間／分頁），零件在上（Q-1）
 *
 * ## 資料流（T5-1 接線）
 *
 * ```
 * fetchCategories／fetchServices／fetchProducts（一次，快取在 this.catalog）
 *   → catalogView.mergeCatalog()      零件在上、過濾下架
 *   → filterCatalogItems()            關鍵字／一級分類／價格區間
 *   → sortCatalogItems()              綜合／價格升／降
 *   → paginateItems()                 本機分頁
 *   → toCardModel()                   images[0]／tags／isSoldOut
 * ```
 *
 * ⚠️ 本頁**不判斷規則**：篩選、排序、分頁、售完都在 `utils/catalogView.js`
 *    （純函式，有測試）。頁面只負責事件、快取、Toast、導覽、寫購物車。
 *
 * ## 參數契約（T5）
 *
 * | 參數 | 用途 |
 * |---|---|
 * | `category` | 一級分類名稱（例：`空調`） |
 * | `keyword` | 初始關鍵字（名稱／英文名／描述） |
 *
 * ⚠️ 舊電商參數 `spuId` 不再使用；導覽一律帶 `productId` 或 `serviceId`（T6a 契約）。
 */

/** 「元」→「分」；空值回 null（代表不限制） */
function toCents(value) {
  if (value === '' || value === null || value === undefined) return null;
  const yuan = Number(value);
  if (!Number.isFinite(yuan) || yuan < 0) return null;
  return Math.round(yuan * 100);
}

Page({
  data: {
    goodsList: [],
    layout: 0,
    sorts: '',
    overall: 1,
    show: false,
    minVal: '',
    maxVal: '',
    hasLoaded: false,
    loadMoreStatus: 0,
    loading: true,
    /** 資料載入失敗（與「查無資料」不同；T5-3 會顯示重試入口） */
    loadError: false,
    /** 目前的一級分類名稱（空＝全部） */
    category: '',
    /** 一級分類 chips：`{ name, value }`（value 是分類名稱；空字串＝全部） */
    categoryOptions: [],
    /** 目前關鍵字 */
    keyword: '',
  },

  /** 目錄快取：`{ services, products }`（篩選／排序／分頁都重複使用，不重打 API） */
  catalog: null,
  /** 已篩選＋排序後的全部項目（分頁前的來源） */
  filteredItems: [],
  pageNum: 1,
  pageSize: 10,

  onLoad(query) {
    const params = query || {};
    this.setData(
      {
        category: params.category || '',
        keyword: params.keyword || '',
      },
      () => this.load(),
    );
  },

  /** 抓一次目錄（三個 API 並行），之後全部在本機計算 */
  async load() {
    this.setData({ loading: true, loadError: false });
    try {
      const [categories, services, products] = await Promise.all([
        fetchCategories(),
        fetchServices(),
        fetchProducts(),
      ]);
      this.catalog = { services: services.list, products: products.list };
      this.categoryTree = catalogView.buildCategoryTree(categories.list);
      this.setData(
        {
          categoryOptions: [
            { name: '全部', value: '' },
            ...this.categoryTree.map((node) => ({ name: node.name, value: node.name })),
          ],
        },
        () => this.refresh(true),
      );
    } catch (err) {
      console.warn('[goods-list] 載入目錄失敗', err);
      this.catalog = null;
      this.setData({ hasLoaded: true, loading: false, loadError: true, goodsList: [] });
      Toast({ context: this, selector: '#t-toast', message: '列表載入失敗，請檢查網路後再試', icon: '' });
    }
  },

  /** 依目前條件重算，並取指定頁 */
  refresh(reset) {
    if (!this.catalog) return;

    const { keyword, category, minVal, maxVal, sorts } = this.data;
    const filtered = catalogView.filterCatalogItems(catalogView.mergeCatalog(this.catalog), {
      keyword,
      category,
      minPriceCents: toCents(minVal),
      maxPriceCents: toCents(maxVal),
    });
    const sorted = catalogView.sortCatalogItems(filtered, sorts);
    this.filteredItems = sorted;

    const page = reset ? 1 : this.pageNum + 1;
    const paged = catalogView.paginateItems(sorted, { page, pageSize: this.pageSize });
    this.pageNum = paged.page;

    const cards = paged.list.map((item) => catalogView.toCardModel(item)).filter(Boolean);
    this.setData({
      goodsList: reset ? cards : this.data.goodsList.concat(cards),
      hasLoaded: true,
      loading: false,
      loadError: false,
      loadMoreStatus: paged.hasMore ? 0 : 2,
    });
  },

  /** 「综合／价格／筛选」變更（T5-2 的 UI 事件） */
  handleFilterChange(e) {
    const { layout = 0, sorts = '' } = e.detail || {};
    // ⚠️ 「综合」的 active 狀態由 overall 決定；以 sorts 為唯一真相，
    //    避免使用者連點「综合」時把 overall 切成 0（畫面看起來像取消選取）。
    const overall = sorts ? 0 : 1;
    this.setData({ layout, overall, sorts, loadMoreStatus: 0 }, () => this.refresh(true));
  },

  /** 搜尋框輸入／清空（T5-2） */
  onSearchChange(e) {
    const keyword = (e.detail && e.detail.value) || '';
    this.setData({ keyword, loadMoreStatus: 0 }, () => this.refresh(true));
  },

  /** 分類 chip（T5-2）：空字串＝全部 */
  onCategoryChange(e) {
    const { category = '' } = e.currentTarget.dataset;
    this.setData({ category, loadMoreStatus: 0 }, () => this.refresh(true));
  },

  onReachBottom() {
    this.onLoadMore();
  },

  /** 「載入更多」按鈕（T5-2）；本機分頁是同步的，按一下直接補下一頁 */
  onLoadMore() {
    if (this.data.loadMoreStatus !== 0 || !this.catalog) return;
    this.refresh(false);
  },

  /** 載入失敗後重試（T5-2 的錯誤畫面） */
  onRetry() {
    this.load();
  },

  /** 空態的「清除篩選」；回到全部＋綜合 */
  onClearFilters() {
    this.setData(
      {
        keyword: '',
        category: '',
        minVal: '',
        maxVal: '',
        sorts: '',
        overall: 1,
        layout: 0,
        loadMoreStatus: 0,
      },
      () => this.refresh(true),
    );
  },

  /** 點卡片 → 詳情頁（商品／服務共用同一頁） */
  gotoGoodsDetail(e) {
    const index = Number(e.currentTarget.dataset.index);
    const card = this.data.goodsList[index];
    this.navigateToDetail(card);
  },

  navigateToDetail(card) {
    if (!card || !card.id) return;
    const param =
      card.itemType === catalogView.ItemType.SERVICE
        ? `serviceId=${card.id}`
        : `productId=${card.id}`;
    wx.navigateTo({ url: `/pages/goods/details/index?${param}` });
  },

  /**
   * 卡片上的加購圖示。
   *
   * 分流規則在 `utils/catalogView.addActionFor()`：
   * | 情況 | 行為 |
   * |---|---|
   * | 服務 | Toast（§3.7.2：服務永遠不進購物車） |
   * | 零件、整件售完 | Toast「已售完」（T5-3：售完優先於選規格） |
   * | 零件、有規格 | 導向詳情頁選規格（T6a 已完成） |
   * | 零件、無規格 | 直接寫入本機購物車 |
   */
  handleAddCart(e) {
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
      this.navigateToDetail(card);
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

  showFilterPopup() {
    this.setData({ show: true });
  },

  showFilterPopupClose() {
    this.setData({ show: false });
  },

  onMinValAction(e) {
    this.setData({ minVal: e.detail.value });
  },

  onMaxValAction(e) {
    this.setData({ maxVal: e.detail.value });
  },

  reset() {
    this.setData({ minVal: '', maxVal: '' });
  },

  /** 價格區間確認：格式錯誤或 min > max 時留在 popup 並提示，不套用 */
  confirm() {
    const { minVal, maxVal } = this.data;
    const min = toCents(minVal);
    const max = toCents(maxVal);

    if ((minVal !== '' && min === null) || (maxVal !== '' && max === null)) {
      Toast({ context: this, selector: '#t-toast', message: '請輸入正確的價格', icon: '' });
      return;
    }
    if (min !== null && max !== null && min > max) {
      Toast({ context: this, selector: '#t-toast', message: '最低價不可大於最高價', icon: '' });
      return;
    }

    this.setData({ show: false, loadMoreStatus: 0 }, () => this.refresh(true));
  },
});
