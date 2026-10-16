'use strict';

/**
 * 權限註冊表與矩陣測試。
 *
 * 最重要的一組是「設定完整性」：它把「忘記宣告 constraints」從
 * **靜默的資安漏洞**變成**當場失敗的測試**。
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const { Permission, ALL_PERMISSIONS, ALL_KEYS, byKey } = require('../../../../packages/domain/access/Permission');
const {
  PermissionGroup, GROUP_PERMISSIONS, ALL_GROUPS, permissionsOfGroups,
} = require('../../../../packages/domain/access/PermissionGroupMatrix');
const {
  ROLE_PERMISSIONS, NON_ADMIN_ROLES, TECHNICIAN_FORBIDDEN, roleHas, effectivePermissions,
} = require('../../../../packages/domain/access/RolePermissionMatrix');
const { CONSTRAINT_REGISTRY } = require('../../../../packages/domain/access/AccessPolicy');

test('⚠️ 設定完整性（防止「白名單靜默失效」）', async (t) => {
  await t.test('每個權限都有 constraints 欄位（空陣列也是宣告）', () => {
    const missing = ALL_PERMISSIONS.filter((p) => !Array.isArray(p.constraints));
    assert.deepEqual(
      missing.map((p) => p.key),
      [],
      '缺少 constraints 欄位 → AccessPolicy 會拋 MisconfiguredPermissionError',
    );
  });

  await t.test('每個宣告的 constraint 名稱都能解析', () => {
    const unknown = new Set();
    for (const p of ALL_PERMISSIONS) {
      for (const name of p.constraints) {
        if (!CONSTRAINT_REGISTRY[name]) unknown.add(name);
      }
    }
    assert.deepEqual([...unknown], [], `未註冊的 constraint 名稱：${[...unknown].join(', ')}`);
  });

  await t.test('每個權限都有非空的 key，且格式為 resource.action', () => {
    for (const p of ALL_PERMISSIONS) {
      assert.match(p.key, /^[a-z_]+\.[a-z_]+$/, `${p.key} 格式不符`);
    }
  });

  await t.test('權限 key 不重複', () => {
    assert.equal(new Set(ALL_KEYS).size, ALL_KEYS.length);
  });

  await t.test('byKey 對未知 key 回 null（不拋錯 —— 由 AccessPolicy 決定怎麼處理）', () => {
    assert.equal(byKey('nope.nope'), null);
    assert.ok(byKey('orders.read'));
  });
});

test('角色矩陣：customer', async (t) => {
  await t.test('可建立與讀取自己的訂單', () => {
    assert.ok(roleHas('customer', 'orders.create'));
    assert.ok(roleHas('customer', 'orders.read'));
    assert.ok(roleHas('customer', 'refunds.request'));
  });

  await t.test('⚠️ 刻意沒有：派單、接單、退款審批、讀取全部訂單', () => {
    for (const forbidden of ['orders.assign', 'orders.accept', 'refunds.approve_small', 'orders.read_all']) {
      assert.equal(roleHas('customer', forbidden), false, `customer 不應有 ${forbidden}`);
    }
  });
});

test('角色矩陣：cs_agent', async (t) => {
  await t.test('可派單、可讀全部訂單、可小額退款審批', () => {
    assert.ok(roleHas('cs_agent', 'orders.assign'));
    assert.ok(roleHas('cs_agent', 'orders.read_all'));
    assert.ok(roleHas('cs_agent', 'refunds.approve_small'));
  });

  await t.test('⚠️ 刻意沒有：大額退款審批、改分潤、改商品、改師傅權限', () => {
    for (const forbidden of [
      'refunds.approve_large', 'profit_terms.manage', 'catalog.manage',
      'users.manage_role', 'technicians.manage', 'audit.read',
    ]) {
      assert.equal(roleHas('cs_agent', forbidden), false, `cs_agent 不應有 ${forbidden}`);
    }
  });

  await t.test('A13 修正 1：分潤條款**唯讀**（可讀不可改）', () => {
    assert.ok(roleHas('cs_agent', 'profit_terms.read'));
    assert.equal(roleHas('cs_agent', 'profit_terms.manage'), false);
  });
});

test('角色矩陣：technician（最嚴格的隔離）', async (t) => {
  await t.test('只能操作被指派給自己的訂單', () => {
    assert.ok(roleHas('technician', 'orders.accept'));
    assert.ok(roleHas('technician', 'orders.complete'));
    assert.ok(roleHas('technician', 'settlement.read_own'));
  });

  await t.test('⚠️ 刻意沒有的權限清單 —— 逐條斷言（有人加了就會紅）', () => {
    for (const forbidden of TECHNICIAN_FORBIDDEN) {
      assert.equal(roleHas('technician', forbidden), false, `師傅不應有 ${forbidden}`);
    }
  });

  await t.test('TECHNICIAN_FORBIDDEN 本身必須是有效的權限 key（避免打錯字）', () => {
    for (const key of TECHNICIAN_FORBIDDEN) {
      assert.ok(ALL_KEYS.includes(key), `${key} 不是有效的權限`);
    }
  });
});

test('⚠️ admin 不在靜態矩陣中（權限來自權限組）', async (t) => {
  await t.test('ROLE_PERMISSIONS 只有三個非 admin 角色', () => {
    assert.deepEqual([...NON_ADMIN_ROLES].sort(), ['cs_agent', 'customer', 'technician']);
    assert.equal('admin' in ROLE_PERMISSIONS, false);
  });

  await t.test('admin 的權限由 permissions 陣列決定', () => {
    const finance = effectivePermissions({ role: 'admin', permissions: ['admin.finance'] });
    assert.ok(finance.has('refunds.approve_large'));
    assert.equal(finance.has('catalog.manage'), false, 'finance 不應有目錄管理權');
  });

  await t.test('⚠️ admin.full 是全部權限', () => {
    const full = effectivePermissions({ role: 'admin', permissions: ['admin.full'] });
    for (const key of ALL_KEYS) {
      assert.ok(full.has(key), `admin.full 應含 ${key}`);
    }
  });

  await t.test('未知權限組拋錯（設定錯誤不靜默忽略）', () => {
    assert.throws(() => effectivePermissions({ role: 'admin', permissions: ['admin.nope'] }), TypeError);
    assert.throws(() => permissionsOfGroups('not-an-array'), TypeError);
  });

  await t.test('沒有 permissions 的 admin → 空集合（不自動給 full）', () => {
    const none = effectivePermissions({ role: 'admin' });
    assert.equal(none.size, 0, '未指派權限組的管理員不能什麼都能做');
  });
});

test('權限組', async (t) => {
  await t.test('四個權限組都存在', () => {
    assert.deepEqual([...ALL_GROUPS].sort(), ['admin.finance', 'admin.full', 'admin.operations', 'admin.support']);
  });

  await t.test('每個權限組內的權限 key 都是有效的', () => {
    for (const [group, list] of Object.entries(GROUP_PERMISSIONS)) {
      for (const key of list) {
        assert.ok(ALL_KEYS.includes(key), `${group} 含無效權限 ${key}`);
      }
    }
  });

  await t.test('⚠️ admin.full 是唯一含 users.manage_role 的權限組', () => {
    // 變更管理員權限是最高敏感操作，不應下放給其他權限組
    const withUserManage = Object.entries(GROUP_PERMISSIONS)
      .filter(([, list]) => list.includes('users.manage_role'))
      .map(([g]) => g);
    assert.deepEqual(withUserManage, ['admin.full']);
  });

  await t.test('finance 與 operations 的職責不重疊（改價 vs 審批退款）', () => {
    const finance = GROUP_PERMISSIONS['admin.finance'];
    const operations = GROUP_PERMISSIONS['admin.operations'];
    assert.equal(finance.includes('catalog.manage'), false, '財務不應能改價');
    assert.equal(operations.includes('refunds.approve_large'), false, '營運不應能批大額退款');
  });

  await t.test('多個權限組取聯集', () => {
    const both = permissionsOfGroups(['admin.finance', 'admin.operations']);
    assert.ok(both.has('refunds.approve_large'));
    assert.ok(both.has('catalog.manage'));
  });
});
