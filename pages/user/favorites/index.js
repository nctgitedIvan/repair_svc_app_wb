import Toast from 'tdesign-miniprogram/toast/index';
import Dialog from 'tdesign-miniprogram/dialog/index';
import { fetchProducts } from '../../../services/api/index';

const favorite = require('../../../utils/favorite.js');

/**
 * 我的收藏（T6a.1-4）。
 *
 * ## 資料來源
 *
 * `utils/favorite.js` 的**本機 Storage**（與購物車同一策略）。
 * ⚠️ 這是 **P7a 的臨時方案**：正式的收藏寫在資料庫集合 `favorites`
 * （`docs/01` §7.1／§7.2 第 9 點），集合是 **P2** 才建。
 * P7b 接上後端後，本頁只需換掉讀寫來源。
 *
 * ⚠️ `customerId` 目前是佔位符（`__local__`），**P5 必須改為後端以 OPENID 判定**。
 *
 * ## 為什麼要抓商品現況
 *
 * 收藏存的是**收藏當時的快照**（`docs/01` §7.2 第 9 點，與購物車的
 * `addedPriceCents` 同一設計）：後台改價不影響已收藏的紀錄。
 * 但清單要告訴使用者「現價已經不同了」→ 因此另抓一次商品現況比對，
 * 比對規則在 `utils/favorite.withCurrentPrices()`（純函式，有測試）。
 */
Page({
  data: {
    ready: false,
    rows: [],
  },

  onShow() {
    this.refresh();
  },

  async refresh() {
    const store = favorite.loadFavorites();
    if (store.items.length === 0) {
      this.setData({ ready: true, rows: [] });
      return;
    }

    let catalog = {};
    try {
      // 取不到現況不影響「顯示收藏」—— 只是沒有漲降價提示
      const { list } = await fetchProducts();
      catalog = list.reduce((acc, product) => {
        acc[product.productId] = product;
        return acc;
      }, {});
    } catch (err) {
      console.warn('[favorites] 取商品現況失敗，只顯示收藏當時的價', err);
    }

    this.setData({ ready: true, rows: favorite.withCurrentPrices(store, catalog) });
  },

  /** 點卡片 → 詳情頁（商品） */
  onRowTap(e) {
    const { productId } = e.currentTarget.dataset;
    if (!productId) return;
    wx.navigateTo({ url: `/pages/goods/details/index?productId=${productId}&spuId=${productId}` });
  },

  /** 取消收藏 */
  onRemove(e) {
    const { productId, name } = e.currentTarget.dataset;
    if (!productId) return;

    Dialog.confirm({
      title: '取消收藏',
      content: `確定要取消收藏「${name || '這件商品'}」嗎？`,
      confirmBtn: '取消收藏',
      cancelBtn: '再想想',
    })
      .then(() => {
        const result = favorite.removeFavorite(favorite.loadFavorites(), productId, Date.now());
        if (!result.ok) return;
        favorite.saveFavorites(result.store);
        Toast({ context: this, selector: '#t-toast', message: '已取消收藏', icon: '' });
        this.refresh();
      })
      .catch(() => {});
  },

  /** 空清單 → 去逛逛零件（與購物車空車態一致的去處） */
  onGotoShop() {
    wx.navigateTo({ url: '/pages/category/index' });
  },
});
