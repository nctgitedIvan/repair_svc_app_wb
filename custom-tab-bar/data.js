/**
 * 客戶端的 tabBar 項目。
 *
 * ⚠️ **為什麼不做「依角色變化的 tabBar」**（P7a-1 調查後推翻原設計）
 *
 * 原本打算讓 tabBar 依角色顯示不同項目，實際上有兩個微信硬限制擋住：
 *
 *   1. **`tabBar.list` 上限 5 項**
 *      客戶端 5 項（首頁／**分類**／購物車／訂單／我的）
 *      + 師傅工作台 1 項 + 客服工作台 1 項 = **7 項** → 超出上限。
 *
 *   2. **tabBar 頁面必須在「主包」**
 *      師傅端與客服端的首頁也得塞進主包，會撐大主包體積。
 *
 * **改採的設計**：
 *   - `tabBar` **只服務客戶端**（就是這 5 項，不隨角色變化）
 *   - 師傅／客服／管理員由 `utils/roleRouter` 以 `wx.reLaunch` 導向各自的工作台
 *   - 那些工作台頁面自製底部導覽（普通 `view`，不是原生 tabBar）
 *
 * 這在業界是多角色小程序的常見做法 —— 原生 tabBar 本來就不是為多角色設計的。
 *
 * 圖示名稱來自專案自帶的 iconfont（`style/iconfont.wxss` 的 `wr` 前綴），
 * 不是 TDesign 內建圖示。
 *
 * ⚠️ **T3.5（2026-10-16）：第 2 項由「服務」改名為「分類」，圖示改 `wr-classify`。**
 *
 * 「分類」是中性詞，涵蓋服務與零件；「服務」一詞太窄 —— 零件不是服務（`docs/01` §3.7.9）。
 *
 * **T3.5 原本只改文字、沒改指向**（當時的判斷是「頁面內容改造排在 P7a-2b」），
 * 於是出現「tabBar 寫分類、點進去是 P7a-1 的服務骨架」的空殼。
 *
 * ⚠️ **T3.6（2026-10-16）修正為指向 `pages/category/index`** ——
 * TDesign 的原始分類頁**一直都在 repo 裡沒被改過**（`goods-category` 元件：
 * 左側一級側邊欄 ＋ 右側二級 tabs ＋ 下方網格），P7a-1 只是把 tabBar 指到新建的
 * `pages/services/index` 骨架。所以修正是「把 tabBar 指回既有頁面 ＋ 接上新資料源」，
 * **不是**重寫一個分類頁。原本的空殼 `pages/services/index` 保留不刪（已標註解）。
 */
export default [
  {
    icon: 'home',
    text: '首頁',
    url: 'pages/home/home',
  },
  {
    icon: 'classify',
    text: '分類',
    url: 'pages/category/index',
  },
  {
    icon: 'cart',
    text: '購物車',
    url: 'pages/cart/index',
  },
  {
    icon: 'list',
    text: '訂單',
    url: 'pages/orders/index',
  },
  {
    icon: 'person',
    text: '我的',
    url: 'pages/usercenter/index',
  },
];
