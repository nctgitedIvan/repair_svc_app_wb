'use strict';

/**
 * CloudDBIdSequenceRepository —— 用 `id_sequences` 集合實作原子序號。
 *
 * 在事務內「讀 → 加一 → 寫回」；單一 doc 操作符合雲開發事務限制。
 * 若文件不存在，視為 0 並建立第一筆。
 *
 * ⚠️ 只寫不跑：目前沒有雲環境；契約測試用 InMemory 版本。
 *
 * @param {{ client: object, uow: { run: Function } }} deps
 */
function createCloudDBIdSequenceRepository({ client, uow } = {}) {
  if (!client || typeof client.collection !== 'function') {
    throw new TypeError('CloudDBIdSequenceRepository 需要 CloudDBClient');
  }
  if (!uow || typeof uow.run !== 'function') {
    throw new TypeError('CloudDBIdSequenceRepository 需要 UnitOfWork');
  }

  return {
    async next(key) {
      if (typeof key !== 'string' || key.length === 0) {
        throw new TypeError('IdSequence.next(key) 需要非空字串');
      }

      return uow.run(async (tx) => {
        const ref = tx.collection('id_sequences').doc(key);
        let current = 0;

        try {
          const snapshot = await ref.get();
          if (snapshot && snapshot.data && Number.isInteger(snapshot.data.value)) {
            current = snapshot.data.value;
          }
        } catch (err) {
          if (!isNotFound(err)) throw err;
        }

        const nextValue = current + 1;
        await ref.set({
          data: { key, value: nextValue, updated_at: Date.now() },
        });
        return nextValue;
      });
    },
  };
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

module.exports = { createCloudDBIdSequenceRepository };
