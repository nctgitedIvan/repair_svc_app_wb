'use strict';

/**
 * CloudDBSystemConfigRepository —— `system_configs` 的雲端實作（只寫不跑）。
 *
 * 以 `key` 作為 doc id，因此不需要 `where` 查詢（也符合事務的單記錄限制）。
 *
 * @param {{ client: object }} deps
 */
function createCloudDBSystemConfigRepository({ client } = {}) {
  if (!client || typeof client.collection !== 'function') {
    throw new TypeError('CloudDBSystemConfigRepository 需要 CloudDBClient');
  }

  const collection = () => client.collection('system_configs');

  return {
    async get(key, defaultValue = null) {
      assertKey(key);
      try {
        const snapshot = await collection().doc(key).get();
        if (snapshot && snapshot.data && Object.prototype.hasOwnProperty.call(snapshot.data, 'value')) {
          return snapshot.data.value;
        }
        return defaultValue;
      } catch (err) {
        if (isNotFound(err)) return defaultValue;
        throw err;
      }
    },

    async set(key, value) {
      assertKey(key);
      await collection()
        .doc(key)
        .set({ data: { key, value, updated_at: Date.now() } });
    },
  };
}

function assertKey(key) {
  if (typeof key !== 'string' || key.length === 0) {
    throw new TypeError('SystemConfig key 必須是非空字串');
  }
}

function isNotFound(err) {
  const text = `${(err && err.errCode) || ''} ${(err && err.code) || ''} ${
    (err && err.message) || ''
  }`.toLowerCase();
  return (
    text.includes('not exist') ||
    text.includes('not found') ||
    text.includes('does not exist') ||
    text.includes('document_not_exist')
  );
}

module.exports = { createCloudDBSystemConfigRepository };
