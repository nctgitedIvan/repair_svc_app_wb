'use strict';

/**
 * AuditChain 測試。
 *
 * 這組測試要證明三件事：
 *   1. **可重現** —— 同輸入必得同 hash（否則會誤報斷點）
 *   2. **可偵測篡改** —— 改任何一個欄位都會被發現
 *   3. **分段不互相干擾** —— 兩張訂單的鏈各自獨立
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const AuditChain = require('../../../../packages/domain/audit/AuditChain');
const {
  computeHash, appendEntry, verifyChain, computeDailyRoot, orderChainId, dailyChainId, GENESIS_HASH,
} = AuditChain;

/** 建立一條從 seq 0 開始的完整鏈 */
function buildChain(n) {
  const entries = [];
  let prev = null;
  for (let i = 0; i < n; i++) {
    prev = appendEntry(prev, { action: `Action${i}`, orderId: 'o1', amountCents: i * 100 });
    entries.push(prev);
  }
  return entries;
}

test('⚠️ 可重現：同輸入必得同 hash', async (t) => {
  await t.test('同內容 → 同 hash', () => {
    const entry = { action: 'AssignOrder', orderId: 'o1', amountCents: 100 };
    assert.equal(computeHash(GENESIS_HASH, entry), computeHash(GENESIS_HASH, entry));
  });

  await t.test('⚠️ 鍵的插入順序不影響 hash（canonicalJSON 的價值）', () => {
    const a = { action: 'X', orderId: 'o1', amountCents: 100 };
    const b = { amountCents: 100, action: 'X', orderId: 'o1' };
    assert.equal(computeHash(GENESIS_HASH, a), computeHash(GENESIS_HASH, b));
  });

  await t.test('巢狀物件同樣與順序無關', () => {
    const a = computeHash(GENESIS_HASH, { before: { status: 20, tech: null } });
    const b = computeHash(GENESIS_HASH, { before: { tech: null, status: 20 } });
    assert.equal(a, b);
  });

  await t.test('hash 是 64 字元 hex', () => {
    assert.match(computeHash(GENESIS_HASH, { a: 1 }), /^[a-f0-9]{64}$/);
  });

  await t.test('prevHash 不同 → hash 不同', () => {
    const entry = { action: 'X' };
    assert.notEqual(computeHash(GENESIS_HASH, entry), computeHash('a'.repeat(64), entry));
  });
});

test('appendEntry：鏈結', async (t) => {
  await t.test('首筆的 prevHash 是 GENESIS、seq 為 0', () => {
    const e0 = appendEntry(null, { action: 'CreateOrder' });
    assert.equal(e0.prevHash, GENESIS_HASH);
    assert.equal(e0.seq, 0);
  });

  await t.test('後續筆串接前一筆的 hash', () => {
    const entries = buildChain(5);
    for (let i = 1; i < entries.length; i++) {
      assert.equal(entries[i].prevHash, entries[i - 1].hash, `第 ${i} 筆的 prevHash 應指向第 ${i - 1} 筆`);
      assert.equal(entries[i].seq, i);
    }
  });

  await t.test('不修改傳入的 entry 物件', () => {
    const source = { action: 'X' };
    appendEntry(null, source);
    assert.deepEqual(Object.keys(source), ['action'], '不得把 prevHash/hash/seq 寫回原物件');
  });

  await t.test('entry 自帶的 prevHash / hash 會被排除（避免自我遞迴）', () => {
    const withJunk = { action: 'X', prevHash: 'junk', hash: 'junk' };
    const a = appendEntry(null, withJunk);
    const b = appendEntry(null, { action: 'X' });
    assert.equal(a.hash, b.hash, '髒欄位不得影響結果');
  });
});

test('⚠️ verifyChain：偵測篡改', async (t) => {
  const entries = buildChain(5);

  await t.test('未篡改 → ok', () => {
    assert.deepEqual(verifyChain(entries), { ok: true, brokenAtSeq: null, reason: null });
  });

  await t.test('改動任一中間筆的內容 → HASH_MISMATCH', () => {
    // 模擬「有人直接改資料庫」（雲開發管理員可以做到，平台層擋不住）
    for (let i = 0; i < entries.length; i++) {
      const tampered = entries.map((e, idx) => (idx === i ? { ...e, amountCents: 999999 } : e));
      const r = verifyChain(tampered);
      assert.equal(r.ok, false, `第 ${i} 筆被改應該被發現`);
      assert.equal(r.brokenAtSeq, i);
      assert.equal(r.reason, 'HASH_MISMATCH');
    }
  });

  await t.test('刪掉中間一筆 → SEQ_GAP', () => {
    const r = verifyChain([entries[0], entries[2], entries[3]]);
    assert.equal(r.ok, false);
    assert.equal(r.reason, 'SEQ_GAP');
  });

  await t.test('偷偷改 prevHash → PREV_HASH_MISMATCH', () => {
    const tampered = entries.map((e, i) => (i === 3 ? { ...e, prevHash: 'f'.repeat(64) } : e));
    const r = verifyChain(tampered);
    assert.equal(r.ok, false);
    assert.equal(r.reason, 'PREV_HASH_MISMATCH');
  });

  await t.test('⚠️ 連 hash 一起改也沒用（下一筆的 prevHash 會對不上）', () => {
    const forged = { ...entries[1], amountCents: 999999 };
    forged.hash = computeHash(forged.prevHash, forged); // 攻擊者重算自己的 hash
    const tampered = [entries[0], forged, entries[2], entries[3], entries[4]];
    const r = verifyChain(tampered);
    assert.equal(r.ok, false, '自己重算 hash 仍會與下一筆的 prevHash 對不上');
    assert.equal(r.brokenAtSeq, 2, '斷點會出現在下一筆');
  });

  await t.test('空鏈 → ok', () => {
    assert.equal(verifyChain([]).ok, true);
  });

  await t.test('非陣列 → 不拋錯，回報錯誤', () => {
    assert.equal(verifyChain(null).ok, false);
    assert.equal(verifyChain(null).reason, 'NOT_AN_ARRAY');
  });
});

test('⚠️ 分段鏈：互不干擾（Q9 的核心目的）', async (t) => {
  await t.test('完整鏈從 seq 0 驗證應通過', () => {
    assert.equal(verifyChain(buildChain(3)).ok, true);
  });

  await t.test('兩張訂單的鏈各自獨立', () => {
    // 模擬並發：A 與 B 兩條鏈同時 append，互不影響
    const a = [];
    const b = [];
    a.push(appendEntry(null, { orderId: 'A', action: 'Create' }));
    b.push(appendEntry(null, { orderId: 'B', action: 'Create' }));
    a.push(appendEntry(a[0], { orderId: 'A', action: 'Assign' }));
    b.push(appendEntry(b[0], { orderId: 'B', action: 'Pay' }));

    assert.equal(verifyChain(a).ok, true, 'A 鏈完整');
    assert.equal(verifyChain(b).ok, true, 'B 鏈完整');
    assert.notEqual(a[0].hash, b[0].hash, '兩條鏈的首筆不同（內容不同）');
    assert.equal(a[1].prevHash, a[0].hash);
    assert.equal(b[1].prevHash, b[0].hash);
  });

  await t.test('兩條不同的鏈不得混在一起驗證（那本來就不是同一條鏈）', () => {
    const a = buildChain(2);
    let b = null;
    b = appendEntry(b, { orderId: 'B', action: 'Create' });
    // b 是另一條鏈的首筆（seq 0），把它接在 a 之後驗證 → 應失敗
    assert.equal(verifyChain([...a, b]).ok, false);
  });

  await t.test('⚠️ 這正是分段鏈能避免分叉的原因：不同訂單不共用前綴', () => {
    const a = appendEntry(null, { orderId: 'A', action: 'Create' });
    const b = appendEntry(null, { orderId: 'B', action: 'Create' });
    assert.equal(a.prevHash, GENESIS_HASH);
    assert.equal(b.prevHash, GENESIS_HASH);
    // 兩者都從 GENESIS 開始，但內容不同 → hash 不同 → 兩條平行的鏈，互不干擾
    assert.notEqual(a.hash, b.hash);
  });

  await t.test('chainId 格式', () => {
    assert.equal(orderChainId('o1'), 'order:o1');
    assert.equal(dailyChainId('2026-10-16'), 'daily:2026-10-16');
  });

  await t.test('chainId 參數校驗', () => {
    assert.throws(() => orderChainId(''), Error);
    assert.throws(() => dailyChainId('2026-10-16T00:00'), Error);
    assert.throws(() => dailyChainId('bad'), Error);
  });
});

test('每日全域鏈的根', async (t) => {
  await t.test('同組尾 hash → 同根（與順序無關）', () => {
    const a = computeDailyRoot(['h1', 'h2', 'h3']);
    const b = computeDailyRoot(['h3', 'h1', 'h2']);
    assert.equal(a, b, '排序後再雜湊，順序不影響');
  });

  await t.test('不同組 → 不同根', () => {
    assert.notEqual(computeDailyRoot(['h1', 'h2']), computeDailyRoot(['h1', 'h3']));
  });

  await t.test('⚠️ 任一尾 hash 被改 → 根改變（可偵測）', () => {
    assert.notEqual(computeDailyRoot(['h1', 'h2', 'h3']), computeDailyRoot(['h1', 'h2', 'hacked']));
  });

  await t.test('空陣列與非陣列不爆', () => {
    assert.match(computeDailyRoot([]), /^[a-f0-9]{64}$/);
    assert.match(computeDailyRoot(null), /^[a-f0-9]{64}$/);
  });
});

test('⚠️ domain 不得使用 crypto 的亂數 API（由 check-layering 保證）', async (t) => {
  await t.test('本模組只用了 createHash，未使用任何亂數 API', () => {
    const src = fs.readFileSync(
      path.join(__dirname, '../../../../packages/domain/audit/AuditChain.js'),
      'utf8',
    );
    assert.match(src, /crypto\s*\.\s*createHash/);

    // 只檢查程式碼行 —— 註解中提及這些名稱是為了說明「為何封鎖」，不算使用。
    // 刻意不用正則，避免轉義問題。
    const NL = String.fromCharCode(10);
    const isCommentLine = (line) => {
      const t = line.trim();
      return t.startsWith('//') || t.startsWith('*') || t.startsWith('/*');
    };
    const codeLines = src.split(NL).filter((line) => !isCommentLine(line)).join(NL);

    for (const forbidden of ['randomBytes', 'randomUUID', 'randomInt', 'generateKeyPair']) {
      assert.equal(codeLines.includes(`crypto.${forbidden}`), false, `不得使用 crypto.${forbidden}`);
    }
  });
});
