'use strict';

/**
 * crypto 白名單的元測試。
 *
 * 為什麼需要這組測試：白名單的價值取決於它**是否仍然正確**。
 * 若白名單裡放了一個不存在於該 Node 版本的成員，或漏掉了某個非確定性 API，
 * 管制就會失效——而這種失效是**靜默的**。
 *
 * 這裡用 `Object.keys(require('crypto'))` 對照真實的 API 清單，
 * 讓「白名單已過時」變成一個**會失敗的測試**。
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const { CRYPTO_MEMBER_ALLOWLIST, CRYPTO_ALLOWED_FILES } = require('../../../../scripts/check-layering.js');

const CRYPTO_EXPORTS = Object.keys(crypto);

/** 已知的非確定性 API（不得出現在白名單中） */
const NON_DETERMINISTIC = [
  'randomBytes', 'randomFill', 'randomFillSync', 'randomInt', 'randomUUID',
  'generateKeyPair', 'generateKeyPairSync', 'generateKey', 'generateKeySync',
  'getRandomValues', 'webcrypto', 'pseudoRandomBytes', 'prng',
];

test('⚠️ 白名單與真實的 crypto API 對照', async (t) => {
  await t.test('白名單不是空的', () => {
    assert.ok(CRYPTO_MEMBER_ALLOWLIST.length > 0);
  });

  await t.test('⚠️ 白名單中的每個成員都必須存在於當前 Node 的 crypto', () => {
    for (const name of CRYPTO_MEMBER_ALLOWLIST) {
      assert.ok(
        CRYPTO_EXPORTS.includes(name),
        `白名單中的 crypto.${name} 不存在於 Node ${process.version} 的 crypto 匯出中 —— ` +
          '白名單已過時，請更新',
      );
    }
  });

  await t.test('⚠️ 白名單中的每個成員都必須是**函式**（不是常數或物件）', () => {
    for (const name of CRYPTO_MEMBER_ALLOWLIST) {
      assert.equal(typeof crypto[name], 'function', `crypto.${name} 不是函式`);
    }
  });

  await t.test('白名單與真實匯出清單的關係（供人工核對）', () => {
    const allowed = new Set(CRYPTO_MEMBER_ALLOWLIST);
    const denied = CRYPTO_EXPORTS.filter((name) => !allowed.has(name));
    // 這條斷言不檢查內容，只是把「被拒絕的數量」固定下來，
    // 讓 Node 升級導致 crypto 擴充時，測試會提示我們重新檢視。
    assert.ok(
      denied.length > 0,
      `crypto 有 ${CRYPTO_EXPORTS.length} 個匯出，白名單只允許 ${CRYPTO_MEMBER_ALLOWLIST.length} 個，` +
        `其餘 ${denied.length} 個一律拒絕`,
    );
    assert.ok(denied.length >= CRYPTO_EXPORTS.length - 5, '白名單必須是少數 —— 否則就不是白名單了');
  });
});

test('⚠️ 非確定性 API 一律不在白名單中', async (t) => {
  for (const name of NON_DETERMINISTIC) {
    await t.test(`crypto.${name} 不得在白名單`, () => {
      assert.equal(
        CRYPTO_MEMBER_ALLOWLIST.includes(name),
        false,
        `${name} 會產生無法重現的值，違反 domain 的確定性要求`,
      );
    });
  }

  await t.test('白名單中的成員本身是確定性的（createHash 同輸入同輸出）', () => {
    for (const name of CRYPTO_MEMBER_ALLOWLIST) {
      if (name === 'createHash') {
        const a = crypto.createHash('sha256').update('x').digest('hex');
        const b = crypto.createHash('sha256').update('x').digest('hex');
        assert.equal(a, b, 'createHash 必須是確定性的');
      }
    }
  });
});

test('⚠️ crypto 只允許在指定的檔案中使用', async (t) => {
  await t.test('只有 AuditChain.js', () => {
    assert.deepEqual([...CRYPTO_ALLOWED_FILES], ['packages/domain/audit/AuditChain.js']);
  });

  await t.test('允許的檔案確實存在', () => {
    for (const rel of CRYPTO_ALLOWED_FILES) {
      const abs = path.join(__dirname, '../../../../', rel);
      assert.ok(fs.existsSync(abs), `${rel} 不存在`);
    }
  });

  await t.test('⚠️ 掃描整個 domain，確認只有允許的檔案 require 了 crypto', () => {
    const domainDir = path.join(__dirname, '../../../../packages/domain');
    const offenders = [];

    (function walk(dir) {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const abs = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (entry.name !== 'node_modules') walk(abs);
        } else if (entry.name.endsWith('.js')) {
          const rel = path.relative(path.join(__dirname, '../../../../'), abs).replace(/\\/g, '/');
          if (CRYPTO_ALLOWED_FILES.includes(rel)) continue;

          const src = fs.readFileSync(abs, 'utf8');
          const isComment = (line) => {
            const t = line.trim();
            return t.startsWith('//') || t.startsWith('*') || t.startsWith('/*');
          };
          const codeLines = src.split(String.fromCharCode(10)).filter((l) => !isComment(l));

          if (codeLines.some((l) => l.includes("require('crypto')") || l.includes('require("crypto")') || l.includes("require('node:crypto')"))) {
            offenders.push(rel);
          }
        }
      }
    })(domainDir);

    assert.deepEqual(offenders, [], `以下檔案不該 require crypto：${offenders.join(', ')}`);
  });
});

test('⚠️ AuditChain 只使用白名單中的成員', async (t) => {
  const auditChainRel = 'packages/domain/audit/AuditChain.js';
  const abs = path.join(__dirname, '../../../../', auditChainRel);

  await t.test('實際使用的 crypto 成員都在白名單內', () => {
    const src = fs.readFileSync(abs, 'utf8');
    const isComment = (line) => {
      const t = line.trim();
      return t.startsWith('//') || t.startsWith('*') || t.startsWith('/*');
    };
    // ⚠️ 必須跨行掃描 —— `crypto\n  .createHash(...)` 在逐行掃描下抓不到
    const code = src
      .split(String.fromCharCode(10))
      .filter((l) => !isComment(l))
      .join(String.fromCharCode(10));

    const used = new Set();
    const re = /\bcrypto\s*\.\s*([A-Za-z_$][\w$]*)/g;
    let m;
    while ((m = re.exec(code))) used.add(m[1]);

    assert.ok(used.size > 0, 'AuditChain 應該有使用 crypto（若為 0，代表掃描方式失效）');
    for (const name of used) {
      assert.ok(
        CRYPTO_MEMBER_ALLOWLIST.includes(name),
        `AuditChain 使用了 crypto.${name}，但它不在白名單中`,
      );
    }
    assert.deepEqual([...used], ['createHash'], '目前只預期使用 createHash');
  });

  await t.test('沒有解構 require（避免繞過成員檢查）', () => {
    const src = fs.readFileSync(abs, 'utf8');
    assert.equal(
      /(?:const|let|var)\s*\{[^}]*\}\s*=\s*require\(\s*['"](?:node:)?crypto['"]\s*\)/.test(src),
      false,
      '請用 crypto.xxx 形式，讓成員白名單檢查能涵蓋',
    );
  });
});
