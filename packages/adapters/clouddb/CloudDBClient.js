'use strict';

/**
 * CloudDBClient —— **唯一**允許取得雲資料庫連線的檔案。
 *
 * 由 `scripts/check-layering.js` 強制：`cloud.database()` 與 `db.collection()`
 * 只允許出現在本檔。其他 adapter 一律透過這裡拿 collection，
 * 日後要換 DB、加 instrumentation 或做測試替身時，只需要改一個地方。
 *
 * ⚠️ 本檔**不直接 require `wx-server-sdk`** —— cloud 由雲函數的 bootstrap
 *    以參數注入。這樣本地測試可以用 fake cloud，不需要安裝 SDK。
 *
 * @param {{ database: () => object }} cloud `wx-server-sdk` 的 cloud 物件
 */
function createCloudDBClient(cloud) {
  if (!cloud || typeof cloud.database !== 'function') {
    throw new TypeError('createCloudDBClient 需要具備 database() 的 cloud 物件');
  }

  const db = cloud.database();

  return {
    /** 原始 db（僅供 UnitOfWork 使用） */
    db: () => db,
    /** `db.command`（`_.inc`、`_.set` 等） */
    command: () => db.command,
    /** 取得 collection */
    collection: (name) => {
      if (typeof name !== 'string' || name.length === 0) {
        throw new TypeError('collection(name) 需要非空字串');
      }
      return db.collection(name);
    },
  };
}

module.exports = { createCloudDBClient };
