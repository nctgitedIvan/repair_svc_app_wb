import Toast from 'tdesign-miniprogram/toast/index';
import Dialog from 'tdesign-miniprogram/dialog/index';
import { fetchProducts } from '../../services/api/index';

const cartRules = require('../../utils/cart.js');
const cartView = require('../../utils/cartView.js');
const { CartCode } = require('../../utils/cartCodes.js');

/**
 * 購物車（**維修零件**）。
 *
 * ## 改造前後
 *
 * 改造前的資料來源是電商 mock（`services/cart/cart` → `model/cart`），
 * 結構是「門店 → 促銷 → 商品」。現在：
 *
 * ```
 * utils/cart.js（本機 Storage，schema 對齊後端）
 *        +
 * services/api/index.js 的 fetchProducts()（商品現況：庫存／價格／上下架）
 *        ↓
 * utils/cartView.js（純函式，組出畫面要的形狀）
 *        ↓
 * 本頁（只負責事件與 Storage 寫入）
 * ```
 *
 * **本頁不判斷任何規則** —— 能不能勾、能不能結算、算多少錢，全部來自上面兩層；
 * 規則與組合邏輯都有單元測試（`tests/unit/frontend/cart*.test.js`）。
 *
 * ## 兩個刻意的設計
 *
 * 1. **勾選狀態只存在記憶體**（`this.selectionByLineId`），不寫進 Storage：
 *    它是「這次要買什麼」的臨時決定，而 `utils/cart.js` 的 schema 要對齊後端
 *    （後端不會存 `isSelected`）。
 * 2. **原始購物車與商品索引放在實例上**（`this.cart` / `this.catalog`），不放 `data`：
 *    避免每次 `setData` 搬大物件，事件處理也能直接拿到原始資料。
 *
 * ## P7b 要改的地方
 *
 * 購物車改為後端（`docs/01` §3.7.8 Q-D）。因為 schema 已經對齊，
 * 屆時只需把 `cartRules.loadCart/saveCart` 換成 API 呼叫，本頁的事件流程不變。
 */

/** 商品列表 → `productId` 索引（購物車的每一筆都靠它找現況） */
function indexProducts(list) {
  const catalog = {};
  for (const product of list || []) {
    catalog[product.productId] = product;
  }
  return catalog;
}

Page({
  cart: null,
  catalog: null,
  selectionByLineId: {},
  settling: false,

  data: {
    ready: false,
    isEmpty: true,
    /** 商品現況取不到（後端未就緒／離線）—— 顯示重試入口，而不是假裝購物車是空的 */
    loadError: false,
    lines: [],
    invalidLines: [],
    selectedLineIds: [],
    totalCents: 0,
    selectedCount: 0,
    allSelected: false,
    hasPriceChange: false,
  },

  /**
   * ⚠️ 一律在 `onShow` 重讀 Storage：使用者可能剛從商品詳情頁加購回來。
   *    （`onLoad` 只跑一次，蓋不到這個情境。）
   */
  onShow() {
    const tabBar = this.getTabBar && this.getTabBar();
    if (tabBar) tabBar.init();
    this.refresh({ reloadProducts: true });
  },

  /**
   * 重讀購物車並重畫。
   *
   * @param {{ reloadProducts?: boolean }} [options]
   *        `true` 時重新抓商品現況（進入頁面、按結算前）；
   *        改數量／刪除時用快取即可，不必多打一次 API。
   */
  async refresh({ reloadProducts = false } = {}) {
    this.cart = cartRules.loadCart();

    if (this.cart.items.length === 0) {
      this.catalog = null;
      this.selectionByLineId = {};
      this.setData({
        ready: true,
        isEmpty: true,
        loadError: false,
        lines: [],
        invalidLines: [],
        selectedLineIds: [],
        totalCents: 0,
        selectedCount: 0,
        allSelected: false,
        hasPriceChange: false,
      });
      return;
    }

    if (reloadProducts || !this.catalog) {
      try {
        this.catalog = indexProducts((await fetchProducts()).list);
      } catch (err) {
        // ⚠️ 取不到商品資料時**保留上一次的畫面**（若有），不清空購物車 ——
        //    清空會讓使用者以為商品被刪了。
        //    首次載入就失敗時沒有任何畫面可留，因此顯示重試入口 ——
        //    **不能顯示空車態**（那等於說「你的購物車是空的」，是騙人的）。
        Toast({ context: this, selector: '#t-toast', message: '商品資料載入失敗，請稍後再試' });
        this.setData({ ready: true, loadError: true });
        return;
      }
    }

    this.setData({ loadError: false });
    this.applyView();
  },

  /** 載入失敗後的重試 */
  onRetry() {
    this.refresh({ reloadProducts: true });
  },

  /** 用目前的 `this.cart` + `this.catalog` 重算畫面（不打 API） */
  applyView() {
    // ⚠️ 勾選狀態用**原始明細**（含失效項）重整 —— 失效項也要記住使用者的決定，
    //    這樣它日後補貨／重新上架時會回到原本的勾選狀態。
    const { selectionByLineId, selectedLineIds: decidedIds } = cartView.reconcileSelection(
      this.selectionByLineId,
      this.cart.items,
    );
    this.selectionByLineId = selectionByLineId;

    const view = cartView.buildCartView({
      cart: this.cart,
      catalog: this.catalog || {},
      selectedLineIds: decidedIds,
    });

    // `data.selectedLineIds` 只放**可結算的**（有效且已勾選）——
    // 否則「只有失效商品被勾著」會讓結算流程的第 ① 關誤判為「有選東西」。
    const selectedLineIds = view.lines.filter((line) => line.isSelected).map((line) => line.lineId);

    this.setData({
      ready: true,
      // 失效商品也算「有東西」—— 要讓使用者看得到並清掉它們
      isEmpty: view.lines.length === 0 && view.invalidLines.length === 0,
      lines: view.lines,
      invalidLines: view.invalidLines,
      selectedLineIds,
      totalCents: view.totalCents,
      selectedCount: view.selectedCount,
      allSelected: view.allSelected,
      hasPriceChange: view.hasPriceChange,
    });
  },

  /** 把購物車寫回 Storage；失敗要講，不能靜默（否則重整就消失） */
  persist() {
    if (cartRules.saveCart(this.cart)) return true;
    Toast({ context: this, selector: '#t-toast', message: '儲存失敗，請稍後再試' });
    return false;
  },

  findLine(lineId) {
    return this.data.lines.concat(this.data.invalidLines).find((line) => line.lineId === lineId);
  },

  // ── 勾選 ──

  onLineSelect(e) {
    const { lineId, isSelected } = e.detail;
    this.selectionByLineId = { ...this.selectionByLineId, [lineId]: isSelected };
    this.applyView();
  },

  /** 全選／取消全選（由 `cart-bar` 發出，值為**目標狀態**） */
  onSelectAll(e) {
    const { isSelected } = e.detail;
    const next = {};
    for (const line of this.data.lines) {
      next[line.lineId] = isSelected;
    }
    this.selectionByLineId = { ...this.selectionByLineId, ...next };
    this.applyView();
  },

  // ── 數量與刪除 ──

  onQuantityChange(e) {
    const { lineId, quantity } = e.detail;
    const result = cartRules.updateQuantity(this.cart, lineId, quantity, Date.now());
    if (!result.ok) {
      Toast({ context: this, selector: '#t-toast', message: '數量不合法，請重新輸入' });
      return;
    }
    this.cart = result.cart;
    if (this.persist()) this.applyView();
  },

  onLineDelete(e) {
    const { lineId } = e.detail;
    const line = this.findLine(lineId);

    Dialog.confirm({
      title: '刪除商品',
      content: line ? `確定要刪除「${line.title}」嗎？` : '確定要刪除這項商品嗎？',
      confirmBtn: '刪除',
      cancelBtn: '取消',
    })
      .then(() => {
        const result = cartRules.removeLine(this.cart, lineId, Date.now());
        if (!result.ok) return;
        this.cart = result.cart;
        if (this.persist()) {
          Toast({ context: this, selector: '#t-toast', message: '已刪除' });
          this.applyView();
        }
      })
      .catch(() => {});
  },

  /** 清除全部失效商品（售完／下架／不存在） */
  onClearInvalid() {
    const count = this.data.invalidLines.length;
    if (count === 0) return;

    let next = this.cart;
    for (const line of this.data.invalidLines) {
      const result = cartRules.removeLine(next, line.lineId, Date.now());
      if (result.ok) next = result.cart;
    }
    this.cart = next;
    if (this.persist()) {
      Toast({ context: this, selector: '#t-toast', message: `已清除 ${count} 件失效商品`, icon: '' });
      this.applyView();
    }
  },

  // ── 導覽 ──

  /**
   * 點商品 → 商品詳情。
   *
   * ⚠️ **過渡期**：同時帶 `productId` 與 `spuId`。
   *    舊的詳情頁吃 `spuId`（且它的 mock 認不得 `prd-*`，會顯示空頁），
   *    **T6 會把詳情頁的參數契約正式定為 `productId`**（計畫 §12 R5）。
   */
  onLineTap(e) {
    const { productId } = e.detail;
    if (!productId) return;
    wx.navigateTo({
      url: `/pages/goods/details/index?productId=${productId}&spuId=${productId}`,
    });
  },

  /** 空車／失效區的「去逛逛零件」 */
  onGotoShop() {
    wx.navigateTo({ url: '/pages/goods/list/index' });
  },

  // ── 結算 ──

  /**
   * 結算。順序刻意如此（每一步失敗都停在原地，不跳頁）：
   *
   * ```
   * ① 沒有勾選任何商品        → 提示，停
   * ② 以**最新**商品現況重新校驗（瀏覽期間庫存／價格可能變動）
   * ③ 下架／不存在            → 自動移除並提示（§3.7.6 第 2 點）
   * ④ 仍有失效項（庫存不足）   → 提示，停（§3.7.6 第 1 點：標紅且不可結算）
   * ⑤ 勾選項有價格變動        → 列出「加入時 → 現價」，取消則停
   * ⑥ 寫入結算資料 → 前往結算頁
   * ```
   */
  async onToSettle() {
    if (this.settling) return;

    if (this.data.selectedLineIds.length === 0) {
      Toast({ context: this, selector: '#t-toast', message: '請先選擇要結算的商品' });
      return;
    }

    this.settling = true;
    try {
      // ② 用最新現況重做一次校驗。取不到就停（fail-closed，不拿舊資料結算）
      try {
        this.catalog = indexProducts((await fetchProducts()).list);
      } catch (err) {
        Toast({ context: this, selector: '#t-toast', message: '無法確認商品狀態，請稍後再試' });
        return;
      }
      this.applyView();

      // ③ 下架／已不存在的商品：自動移除並提示
      const removed = this.removeSettleBlockingLines([CartCode.DELISTED, CartCode.PRODUCT_NOT_FOUND]);
      if (removed > 0) {
        Toast({
          context: this,
          selector: '#t-toast',
          message: `已自動移除 ${removed} 件失效商品`,
          icon: '',
        });
      }

      // ④ 仍有失效項（庫存不足）→ 停，讓使用者自己決定要減量還是清掉
      if (this.data.invalidLines.length > 0) {
        Toast({
          context: this,
          selector: '#t-toast',
          message: '有商品庫存不足，請調整數量或清除失效商品',
          icon: '',
        });
        return;
      }

      const selected = this.data.lines.filter((line) => line.isSelected);
      if (selected.length === 0) {
        Toast({ context: this, selector: '#t-toast', message: '請先選擇要結算的商品' });
        return;
      }

      // ⑤ 價格變動：講清楚「將以新價結算」，由使用者決定
      if (this.data.hasPriceChange) {
        const changed = this.data.lines.filter((line) => line.isSelected && line.isPriceChanged);
        const detail = changed
          .map((line) => `${line.title}：¥${cartView.formatCents(line.addedPriceCents)} → ¥${line.currentPriceText}`)
          .join('\n');
        try {
          await Dialog.confirm({
            title: '商品價格已變動',
            content: `${detail}\n\n將以新價格結算。`,
            confirmBtn: '以新價結算',
            cancelBtn: '再想想',
          });
        } catch (err) {
          return; // 使用者取消
        }
      }

      // ⑥ 寫入結算資料
      if (!this.writeCheckout(selected)) {
        Toast({ context: this, selector: '#t-toast', message: '無法前往結算，請稍後再試' });
        return;
      }
      wx.navigateTo({ url: '/pages/order/order-confirm/index?type=cart' });
    } finally {
      this.settling = false;
    }
  },

  /**
   * 依問題碼移除明細（結算流程第 ③ 步）。
   * @returns {number} 實際移除的筆數
   */
  removeSettleBlockingLines(codes) {
    const targets = this.data.invalidLines.filter((line) => codes.includes(line.issueCode));
    if (targets.length === 0) return 0;

    let next = this.cart;
    for (const line of targets) {
      const result = cartRules.removeLine(next, line.lineId, Date.now());
      if (result.ok) next = result.cart;
    }
    this.cart = next;
    this.persist();
    this.applyView();
    return targets.length;
  },

  /**
   * 寫入結算資料（T7：只有一份格式，`repair.checkout.v1`）。
   *
   * @returns {boolean} 是否成功（失敗就不該導頁 —— 否則結算頁沒有資料）
   */
  writeCheckout(selectedLines) {
    const selectedIds = selectedLines.map((line) => line.lineId);
    const selectedCart = {
      items: this.cart.items.filter((item) => selectedIds.includes(item.lineId)),
    };

    try {
      wx.setStorageSync(
        cartRules.CHECKOUT_KEY,
        JSON.stringify(cartRules.toCheckoutPayload(selectedCart, { addressId: null, appointmentAt: null })),
      );
      return true;
    } catch (err) {
      console.warn('[cart] 寫入結算資料失敗', err);
      return false;
    }
  },
});
