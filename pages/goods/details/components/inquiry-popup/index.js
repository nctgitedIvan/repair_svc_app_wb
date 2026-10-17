/**
 * 詢問商品彈窗（T6b）。
 *
 * 只負責「輸入與回報」，不碰 Storage：
 * - `close`：使用者取消或點擊遮罩
 * - `submit`：使用者按「發送」，帶 `{ message }`
 *
 * ⚠️ 寫入本機 Storage 與 Toast 由詳情頁負責（與規格彈窗同一分工）。
 */
Component({
  options: {
    multipleSlots: true,
    addGlobalClass: true,
  },

  properties: {
    show: {
      type: Boolean,
      value: false,
    },
    /** 商品名稱（顯示在「是否詢問該商品：…」） */
    productName: {
      type: String,
      value: '',
    },
    /** 與 utils/inquiry.js 的 MAX_MESSAGE_LENGTH 一致 */
    maxlength: {
      type: Number,
      value: 200,
    },
  },

  data: {
    message: '',
  },

  observers: {
    /** 每次重新開啟都清空上一次的輸入 */
    show(show) {
      if (show) this.setData({ message: '' });
    },
  },

  methods: {
    handleClose() {
      this.triggerEvent('close');
    },

    handleInput(e) {
      this.setData({ message: (e.detail && e.detail.value) || '' });
    },

    handleSubmit() {
      this.triggerEvent('submit', { message: this.data.message });
    },
  },
});
