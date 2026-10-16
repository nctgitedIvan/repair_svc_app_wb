/**
 * 聯絡客服元件。
 *
 * ⚠️ P7a-1 資安修正：**移除了 `wx.makePhoneCall`。**
 *
 *    原實作是 `wx.makePhoneCall({ phoneNumber: this.properties.phoneNumber })` ——
 *    一個**接受任意號碼**的通用撥號元件。
 *    師傅端若複用它，就等於把客戶號碼餵進去，直接違反
 *    「師傅端不提供直接撥打客戶電話」的禁令（`docs/00` §5.4）。
 *
 *    現在改為**導向客服工單**：
 *      - 所有客戶↔師傅的溝通都經客服中轉，並留下紀錄（你的業務規則 2）
 *      - 不再有「把號碼傳進來就能撥」的路徑
 *
 *    客戶端若需撥打客服電話，請使用 `pages/usercenter` 的既有入口
 *    （那是「客戶打給平台」，不是「師傅打給客戶」，兩者性質不同）。
 */
Component({
  externalClasses: ['wr-class'],

  properties: {
    /** 服務時間說明（例如「週一至週日 09:00-18:00」） */
    desc: String,
    /** 要帶入工單的訂單號（可選） */
    orderNo: {
      type: String,
      value: '',
    },
    /** 標題文字，預設「聯繫客服」 */
    title: {
      type: String,
      value: '聯繫客服',
    },
  },

  data: {
    show: false,
  },

  methods: {
    onBtnTap() {
      this.setData({ show: true });
    },

    onDialogClose() {
      this.setData({ show: false });
    },

    /**
     * 導向客服工單。
     *
     * 這是**唯一**的聯絡方式 —— 不再提供撥號。
     */
    onGoToWorkOrder() {
      const { orderNo } = this.properties;
      const query = orderNo ? `?orderNo=${encodeURIComponent(orderNo)}` : '';
      this.setData({ show: false });
      wx.navigateTo({
        url: `/pages/workorder/chat/index${query}`,
        fail: () => {
          // 工單頁尚未建立時（P7a-2 才會有）給出明確提示，而不是靜默失敗
          wx.showToast({ title: '客服工單功能建置中', icon: 'none' });
        },
      });
    },
  },
});
