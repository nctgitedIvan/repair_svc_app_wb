/**
 * 客戶端的 tabBar 項目。
 *
 * ⚠️ **為什麼不做「依角色變化的 tabBar」**（P7a-1 調查後推翻原設計）
 *
 * 原本打算讓 tabBar 依角色顯示不同項目，實際上有兩個微信硬限制擋住：
 *
 *   1. **`tabBar.list` 上限 5 項**
 *      客戶端 4 項（首頁／服務／訂單／我的）
 *      + 師傅工作台 1 項 + 客服工作台 1 項 = **6 項** → 超出上限。
 *
 *   2. **tabBar 頁面必須在「主包」**
 *      師傅端與客服端的首頁也得塞進主包，會撐大主包體積。
 *
 * **改採的設計**：
 *   - `tabBar` **只服務客戶端**（就是這 4 項，不隨角色變化）
 *   - 師傅／客服／管理員由 `utils/roleRouter` 以 `wx.reLaunch` 導向各自的工作台
 *   - 那些工作台頁面自製底部導覽（普通 `view`，不是原生 tabBar）
 *
 * 這在業界是多角色小程序的常見做法 —— 原生 tabBar 本來就不是為多角色設計的。
 *
 * 圖示名稱來自專案自帶的 iconfont（`style/iconfont.wxss` 的 `wr` 前綴），
 * 不是 TDesign 內建圖示。
 */
export default [
  {
    icon: 'home',
    text: '首頁',
    url: 'pages/home/home',
  },
  {
    icon: 'service',
    text: '服務',
    url: 'pages/services/index',
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
