import Toast from 'tdesign-miniprogram/toast/index';

/**
 * 購物車清單（**正常商品**＋**失效商品**兩個區塊）。
 *
 * ## 與改造前（電商版）的差別
 *
 * 舊版是「門店 → 促銷活動 → 商品」三層結構，因為電商一個購物車會跨多間店。
 * **維修場景只有一個平台，沒有門店概念**，因此改成扁平清單（`docs/P7a-2a-T4-計畫.md` §6）。
 * 一併移除：門店列、優惠券入口、促銷活動列、「去凑单／再逛逛」、缺貨分組。
 *
 * ## ⚠️ 本元件**不持有任何選取狀態**
 *
 * 舊版直接改 `goods.isSelected`（改的是 property 傳進來的物件，**沒有 setData**）——
 * 那是一個隱性 bug：畫面會不會更新取決於別的地方有沒有觸發重繪。
 * 現在本元件只把事件往上送，**狀態一律由頁面持有**。
 *
 * 本元件同樣**不知道**商品庫存／價格的規則 —— 那些都在 `utils/cartView.js` 算好，
 * 它拿到的 `lines` 已經是完整的 view model。
 */
Component({
  externalClasses: ['wr-class'],

  /**
   * 標記本次點擊是否因為點「規格」觸發。
   *
   * 底層 `goods-card` 沒有 catch 規格點擊，所以點規格會連帶觸發卡片的 click；
   * 用它來避免「點規格卻跳去商品詳情」。
   */
  isSpecsTap: false,

  properties: {
    /** 正常商品（`utils/cartView.js` 的 `lines`） */
    lines: {
      type: Array,
      value: [],
    },
    /** 失效商品（售完／下架／不存在）：不可勾選、不可結算 */
    invalidLines: {
      type: Array,
      value: [],
    },
    thumbWidth: { type: null },
    thumbHeight: { type: null },
  },

  data: {
    isShowSpecs: false,
    currentGoods: {},
  },

  methods: {
    /** 從當前的 lines 找出某一筆（找不到回 undefined，呼叫端需自行防護） */
    findLine(lineId) {
      const all = (this.data.lines || []).concat(this.data.invalidLines || []);
      return all.find((line) => line.lineId === lineId);
    },

    /** 勾選／取消勾選（失效商品不綁這個事件） */
    selectGoods(e) {
      const { lineId } = e.currentTarget.dataset;
      const line = this.findLine(lineId);
      this.triggerEvent('select', { lineId, isSelected: !(line && line.isSelected) });
    },

    /** 數量變更（stepper 的 + / −） */
    changeStepper(e) {
      const { value } = e.detail;
      this.commitQuantity(e.currentTarget.dataset.lineId, value);
    },

    /** 手動輸入數量（失焦時觸發） */
    input(e) {
      this.commitQuantity(e.currentTarget.dataset.lineId, e.detail.value);
    },

    /**
     * 送出數量，**超過庫存就地擋下**。
     *
     * 這裡的即時上限是 UX（不要讓使用者改了才在結算被擋）；
     * 真正的庫存校驗仍在結算時由 `cartView` 重做一次 —— 瀏覽期間庫存可能變動。
     */
    commitQuantity(lineId, rawValue) {
      const line = this.findLine(lineId);
      if (!line) return;

      const value = Number(rawValue);
      if (!Number.isInteger(value) || value < 1) return; // 清空或亂打：不送出，維持原值

      const max = Number.isInteger(line.maxQuantity) ? line.maxQuantity : value;
      if (value > max) {
        Toast({
          context: this,
          selector: '#t-toast',
          message: `庫存不足，最多 ${max} 件`,
        });
        // 已經在上限就不動；否則帶到上限（與舊版行為一致）
        if (line.quantity >= max) return;
        this.triggerEvent('quantitychange', { lineId, quantity: max });
        return;
      }

      if (value === line.quantity) return; // 沒有變化就不送事件
      this.triggerEvent('quantitychange', { lineId, quantity: value });
    },

    /** stepper 自己擋下的超限（例如長按連續加） */
    overlimit(e) {
      const text = e.detail.type === 'minus' ? '數量不能再少了' : '已達可購買上限';
      Toast({ context: this, selector: '#t-toast', message: text });
    },

    deleteGoods(e) {
      this.triggerEvent('delete', { lineId: e.currentTarget.dataset.lineId });
    },

    clearInvalidGoods() {
      this.triggerEvent('clearinvalid');
    },

    /** 空車或失效區的「去逛逛零件」 */
    gotoBuyMore() {
      this.triggerEvent('gocollect');
    },

    /** 點商品 → 頁面決定跳去哪裡 */
    goGoodsDetail(e) {
      if (this.isSpecsTap) {
        this.isSpecsTap = false;
        return;
      }
      const { lineId } = e.currentTarget.dataset;
      const line = this.findLine(lineId);
      if (!line) return;
      this.triggerEvent('goodsclick', {
        lineId: line.lineId,
        productId: line.productId,
        specId: line.specId,
      });
    },

    // 展示規格 popup
    specsTap(e) {
      this.isSpecsTap = true;
      const { lineId } = e.currentTarget.dataset;
      this.setData({
        isShowSpecs: true,
        currentGoods: this.findLine(lineId) || {},
      });
    },

    hideSpecsPopup() {
      this.setData({ isShowSpecs: false });
    },
  },
});
