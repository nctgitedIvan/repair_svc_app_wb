export const config = {
  /** 是否使用mock代替api返回（既有電商頁面用） */
  useMock: true,

  /**
   * 維修模式開關（頁面層級）。
   *
   * `true`  = 新介面
   * `false` = 原電商介面
   *
   * ⚠️ **只允許在 `pages/` 底下的檔案判斷這個旗標**（見 `scripts/check-frontend.js` 規則 4）。
   *    它不得散佈到 `components/`／`services/`／`utils/` —— 否則前端會布滿 `if (flag)`。
   *
   * 用途：P7a／P7b 改造期間，任何一頁改壞了可以**單獨切回舊行為**，
   * 不必整包回滾。
   */
  repairMode: true,

  /**
   * API 來源。
   *
   * `'fake'`  → `services/api/_fake`（P7a：記憶體假資料，讓 UI 在 P5 之前可開發）
   * `'cloud'` → `services/api/real`（P7b：呼叫雲函數）
   *
   * ⚠️ 頁面**只能**透過 `services/api/index.js` 取資料，不得直接 import 任一實作。
   */
  apiMode: 'fake',
};

export const cdnBase =
  'https://we-retail-static-1300977798.cos.ap-guangzhou.myqcloud.com/retail-mp';

export { areaData } from './areaData';
