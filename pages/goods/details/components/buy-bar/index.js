Component({
  externalClasses: ['wr-sold-out', 'wr-class'],

  options: { multipleSlots: true },

  properties: {
    soldout: {
      // 商品是否下架
      type: Boolean,
      value: false,
    },
    /**
     * 左側的入口（客服／收藏）。
     *
     * ⚠️ **T6a-5 起改為 `{ key, title, iconName }`，不再是 `{ url }`。**
     *
     * 舊版把 `url` 交給 `wx.switchTab` —— 那只能用在 **tabBar 頁面**，
     * 而「客服」與「收藏」都不是 tabBar 頁（收藏是一個動作，客服是開彈窗）。
     * 因此改成**動作代碼**，由頁面依 `key` 分流。
     *
     * `key: 'home' | 'cart'` 仍保留支援（會走 `switchTab`），供其他頁面日後複用。
     */
    jumpArray: {
      type: Array,
      value: [],
    },
    isStock: {
      type: Boolean,
      value: true,
    }, // 是否有库存
    isSlotButton: {
      type: Boolean,
      value: false,
    }, // 是否开启按钮插槽
    shopCartNum: {
      type: Number, // 购物车气泡数量
    },
    buttonType: {
      type: Number,
      value: 0,
    },
    /**
     * T6a.3-5：`'product' | 'service'`。
     *
     * 服務不進購物車（§3.7.2），右下角改為單一「立即預約」；
     * 目前只給 Toast 佔位，真正的結算流程在 T7。
     */
    itemType: {
      type: String,
      value: 'product',
    },
    minDiscountPrice: {
      type: String,
      value: '',
    },
    minSalePrice: {
      type: String,
      value: '',
    },
  },

  data: {
    fillPrice: false,
  },

  methods: {
    toAddCart() {
      const { isStock } = this.properties;
      if (!isStock) return;
      this.triggerEvent('toAddCart');
    },

    /**
     * T6a.1-3 恢復。
     *
     * 語意（使用者 2026-10-17 決策）：**跳過購物車、直接進結算**。
     * 真正的結算流程是 **T7** 的範圍，因此頁面目前只給佔位提示。
     */
    toBuyNow() {
      const { isStock } = this.properties;
      if (!isStock) return;
      this.triggerEvent('toBuyNow');
    },

    toBuyNow(e) {
      const { isStock } = this.properties;
      if (!isStock) return;
      this.triggerEvent('toBuyNow', e);
    },

    /** 左側入口：只回報「按了哪一個」，導覽與動作由頁面決定 */
    toNav(e) {
      const { key } = e.currentTarget.dataset;
      return this.triggerEvent('toNav', { key });
    },
  },
});
