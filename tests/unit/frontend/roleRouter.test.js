'use strict';

/**
 * 前端路由與顯示邏輯的單元測試。
 *
 * 這兩個模組刻意用 CommonJS 撰寫，就是為了讓這些測試能直接 require。
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  ROLE_HOME, FALLBACK_ROLE, homePathForRole, isKnownRole, knownRoles,
} = require('../../../utils/roleRouter');

const {
  ROLES, isCustomer, isTechnician, isCsAgent, isAdmin, isStaff, visibleItems,
} = require('../../../utils/roleVisibility');

test('⚠️ 路由分發（P7a1-A6）', async (t) => {
  await t.test('四個角色各自導向正確首頁', () => {
    assert.equal(homePathForRole('customer'), '/pages/home/home');
    assert.equal(homePathForRole('technician'), '/pages/technician/home/index');
    assert.equal(homePathForRole('cs_agent'), '/pages/cs/index/index');
    assert.equal(homePathForRole('admin'), '/pages/admin/overview/index');
  });

  await t.test('路徑一律以 / 開頭（reLaunch 的要求）', () => {
    for (const role of knownRoles()) {
      assert.match(homePathForRole(role), /^\//, `${role} 的路徑必須以 / 開頭`);
    }
  });

  await t.test('⚠️ 未知角色 fallback 到客戶首頁（不導向空白）', () => {
    assert.equal(homePathForRole('ghost'), ROLE_HOME[FALLBACK_ROLE]);
    assert.equal(homePathForRole(undefined), ROLE_HOME[FALLBACK_ROLE]);
    assert.equal(homePathForRole(null), ROLE_HOME[FALLBACK_ROLE]);
    assert.equal(homePathForRole(''), ROLE_HOME[FALLBACK_ROLE]);
  });

  await t.test('fallback 本身必須是已知角色（避免遞迴或空值）', () => {
    assert.ok(isKnownRole(FALLBACK_ROLE));
  });

  await t.test('isKnownRole', () => {
    for (const role of ['customer', 'technician', 'cs_agent', 'admin']) {
      assert.equal(isKnownRole(role), true);
    }
    assert.equal(isKnownRole('ghost'), false);
    assert.equal(isKnownRole(''), false);
  });

  await t.test('⚠️ 不得繼承 Object.prototype 的屬性當成角色', () => {
    // 'toString' / 'constructor' 這類鍵若用 `in` 判斷會誤判
    assert.equal(isKnownRole('toString'), false);
    assert.equal(isKnownRole('constructor'), false);
    assert.equal(isKnownRole('hasOwnProperty'), false);
  });

  await t.test('ROLE_HOME 是凍結的（避免被執行期改寫）', () => {
    assert.equal(Object.isFrozen(ROLE_HOME), true);
  });

  await t.test('純函式：多次呼叫結果一致', () => {
    assert.equal(homePathForRole('technician'), homePathForRole('technician'));
  });
});

test('角色判定（顯示用，**不是權限**）', async (t) => {
  await t.test('四個角色各自正確', () => {
    assert.equal(isCustomer('customer'), true);
    assert.equal(isTechnician('technician'), true);
    assert.equal(isCsAgent('cs_agent'), true);
    assert.equal(isAdmin('admin'), true);
  });

  await t.test('互斥', () => {
    assert.equal(isTechnician('cs_agent'), false);
    assert.equal(isAdmin('technician'), false);
    assert.equal(isCustomer('admin'), false);
  });

  await t.test('isStaff：客服與管理員', () => {
    assert.equal(isStaff('cs_agent'), true);
    assert.equal(isStaff('admin'), true);
    assert.equal(isStaff('customer'), false);
    assert.equal(isStaff('technician'), false);
  });

  await t.test('未知角色一律 false（不預設放行任何顯示）', () => {
    for (const fn of [isCustomer, isTechnician, isCsAgent, isAdmin, isStaff]) {
      assert.equal(fn('ghost'), false);
      assert.equal(fn(undefined), false);
      assert.equal(fn(null), false);
    }
  });
});

test('visibleItems：依角色過濾顯示項目', async (t) => {
  const items = [
    { id: 'orders', roles: ['customer', 'technician', 'cs_agent', 'admin'] },
    { id: 'my-tasks', roles: ['technician'] },
    { id: 'dispatch', roles: ['cs_agent', 'admin'] },
    { id: 'earnings', roles: ['technician'] },
  ];

  await t.test('客戶只看得到 orders', () => {
    assert.deepEqual(visibleItems(items, 'customer').map((i) => i.id), ['orders']);
  });

  await t.test('師傅看得到 orders / my-tasks / earnings', () => {
    assert.deepEqual(visibleItems(items, 'technician').map((i) => i.id), ['orders', 'my-tasks', 'earnings']);
  });

  await t.test('客服看得到 orders / dispatch', () => {
    assert.deepEqual(visibleItems(items, 'cs_agent').map((i) => i.id), ['orders', 'dispatch']);
  });

  await t.test('未知角色 → 空陣列（不是全部）', () => {
    assert.deepEqual(visibleItems(items, 'ghost'), []);
  });

  await t.test('非陣列輸入不爆', () => {
    assert.deepEqual(visibleItems(null, 'customer'), []);
    assert.deepEqual(visibleItems(undefined, 'customer'), []);
  });

  await t.test('缺少 roles 欄位的項目被略過（不預設所有人可見）', () => {
    const withBad = [...items, { id: 'no-roles' }];
    assert.equal(visibleItems(withBad, 'customer').some((i) => i.id === 'no-roles'), false);
  });
});

test('⚠️ 這兩個模組都不是權限系統（用測試把這件事固定下來）', async (t) => {
  await t.test('roleVisibility 不提供任何 can/allow/permission 概念', () => {
    const mod = require('../../../utils/roleVisibility');
    const names = Object.keys(mod).join(' ').toLowerCase();
    for (const forbidden of ['can', 'allow', 'permission', 'authorize', 'authoriz']) {
      assert.equal(names.includes(forbidden), false, `不應出現 ${forbidden} 相關命名`);
    }
  });

  await t.test('roleRouter 只做導向，不做判斷', () => {
    const mod = require('../../../utils/roleRouter');
    assert.equal(typeof mod.homePathForRole, 'function');
    // dispatch 有副作用（呼叫 wx.reLaunch），故不在測試中呼叫
    assert.equal(typeof mod.dispatch, 'function');
  });
});
