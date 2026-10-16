Component({
  properties: {
    imgUrl: {
      type: String,
      value: 'https://tdesign.gtimg.com/miniprogram/template/retail/template/empty-cart.png',
    },
    // ⚠️ 預設值也一律繁體（T4 收尾）——
    //    目前購物車頁每次都明確傳入，這兩個預設值不可達；
    //    但留著簡體是隱患（日後別的頁面直接用它就會漏出簡體）。
    tip: {
      type: String,
      value: '購物車是空的',
    },
    btnText: {
      type: String,
      value: '去逛逛零件',
    },
  },
  data: {},
  methods: {
    handleClick() {
      this.triggerEvent('handleClick');
    },
  },
});
