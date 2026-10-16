Component({
  externalClasses: ['custom-class'],

  properties: {
    activeKey: {
      type: Number,
      value: 0,
    },
    tabList: {
      type: Array,
      value: [],
    },
    showMore: Boolean, // 是否需要下拉功能
  },
  observers: {
    /**
     * ⚠️ T3.6 修正：原本的條件是 `if (this.properties.tabList && newVal)`。
     *
     * `newVal === 0` 是**合法且常見**的值（選中第一個 tab），但在 JS 裡是 falsy，
     * 於是「切換一級分類 → 二級索引重設為 0」時這個 observer 不會動作，
     * `currentActive` 停留在上一個一級的高亮位置 —— 二級 tabs 會亮錯。
     *
     * 改為明確判斷 `!== undefined`：值為 0 時仍要更新高亮。
     * （這個分支（`isSlotRight`）在 T3.6 之前從未被使用，所以是既有但潛伏的問題。）
     */
    activeKey(newVal) {
      if (this.properties.tabList && newVal !== undefined) {
        this.setActive(newVal).catch((e) => {
          console.error(e);
        });
      }
    },
  },

  data: {
    currentActive: -1,
  },
  attached() {
    this.setActive(this.properties.activeKey).catch((e) => {
      console.error(e);
    });
  },

  methods: {
    setActive(activeKey) {
      if (!this.properties.tabList[activeKey] || this.properties.tabList[activeKey].disabled) {
        return Promise.reject('数据异常或不可操作');
      }
      return new Promise((resolve) => {
        this.setData(
          {
            currentActive: activeKey,
          },
          () => resolve(),
        );
      });
    },
    onClick(event) {
      let activeKey;
      if (event.type === 'select') {
        activeKey = event.detail;
      } else {
        activeKey = event.currentTarget.dataset.index;
      }
      this.setActive(activeKey)
        .then(() => {
          const { currentActive } = this.data;
          this.triggerEvent('change', { index: currentActive });
        })
        .catch((e) => {
          console.error(e);
        });
    },
  },
});
