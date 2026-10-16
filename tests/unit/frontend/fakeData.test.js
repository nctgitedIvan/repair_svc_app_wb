'use strict';

/**
 * 保護「fake 資料刻意過度完整」這個驗收設計。
 *
 * 為什麼要測這個：師傅端「不顯示敏感資料」的驗收，建立在
 * **fake 資料含有完整敏感欄位**的前提上。
 * 若有人「順手」把 fake 改成脫敏版本，驗收就會變成
 * 「UI 直接印出 customer.phone 也看不出問題」—— 但**沒有人會發現**。
 *
 * 這組測試就是那個「會發現」的機制。
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const data = require('../../../services/api/_fake/data');

const FULL_PHONE_RE = /(?<!\d)1[3-9]\d{9}(?!\d)/;

test('⚠️ fake 資料必須「刻意過度完整」（否則師傅端驗收會失效）', async (t) => {
  await t.test('客戶資料含完整手機號', () => {
    for (const [id, customer] of Object.entries(data.CUSTOMERS)) {
      assert.match(
        customer.phone,
        FULL_PHONE_RE,
        `${id} 的 phone 必須是完整號碼 —— 這是師傅端「不得顯示」的驗收前提`,
      );
    }
  });

  await t.test('客戶資料含完整地址（門牌）', () => {
    for (const [id, customer] of Object.entries(data.CUSTOMERS)) {
      assert.ok(
        customer.address.detailAddress && customer.address.detailAddress.length > 0,
        `${id} 必須有完整門牌 —— 這是地址分級揭露的驗收前提`,
      );
      assert.match(customer.address.detailAddress, /\d+號/, '門牌應含「號」');
    }
  });

  await t.test('客戶資料含完整姓名（非只有姓氏）', () => {
    for (const [id, customer] of Object.entries(data.CUSTOMERS)) {
      assert.ok(customer.name && customer.name.length >= 2, `${id} 應有完整姓名`);
    }
  });
});

test('⚠️ 師傅報酬不得含分潤比例（Q-E）', async (t) => {
  await t.test('報酬紀錄只有金額與狀態', () => {
    for (const earning of data.TECHNICIAN_EARNINGS) {
      const keys = Object.keys(earning).sort();
      assert.deepEqual(keys, ['amountCents', 'orderNo', 'settledAt', 'sharingStatus']);
    }
  });

  await t.test('⚠️ 不得出現任何比例／抽成欄位', () => {
    const json = JSON.stringify(data.TECHNICIAN_EARNINGS);
    for (const forbidden of ['Rate', 'rate', 'Bp', 'commission', 'platformShare', 'profitSharingTerms']) {
      assert.equal(
        json.includes(forbidden),
        false,
        `師傅報酬不得含「${forbidden}」—— 分潤比例是談判籌碼，公開會讓師傅互相比較`,
      );
    }
  });

  await t.test('分帳狀態使用約定值', () => {
    const allowed = ['FROZEN', 'SHARED', 'RETURNED'];
    for (const earning of data.TECHNICIAN_EARNINGS) {
      assert.ok(allowed.includes(earning.sharingStatus), `未知的分帳狀態：${earning.sharingStatus}`);
    }
  });
});

test('訂單資料的形狀', async (t) => {
  await t.test('每筆訂單都有訂單號與狀態', () => {
    for (const order of data.ORDERS) {
      assert.match(order.orderNo, /^R\d{14}$/, '訂單號格式應為 R + 14 位數字');
      assert.ok(typeof order.status === 'string' && order.status.length > 0);
    }
  });

  await t.test('金額欄位是整數分（不是字串、不是浮點）', () => {
    for (const order of data.ORDERS) {
      assert.ok(Number.isInteger(order.totalCents), `${order.orderNo} 的 totalCents 必須是整數分`);
      for (const item of order.items) {
        assert.ok(Number.isInteger(item.amountCents), `${order.orderNo} 的明細金額必須是整數分`);
      }
    }
  });

  await t.test('明細涵蓋服務費與材料費（驗證 feeType 分流）', () => {
    const feeTypes = new Set();
    for (const order of data.ORDERS) {
      for (const item of order.items) feeTypes.add(item.feeType);
    }
    assert.ok(feeTypes.has('SERVICE_FEE'), '假資料應至少有一筆服務費');
    assert.ok(feeTypes.has('MATERIAL_FEE'), '假資料應至少有一筆材料費');
  });

  await t.test('⚠️ 有一個「已派單待接單」的訂單（師傅端的主要驗收場景）', () => {
    assert.ok(
      data.ORDERS.some((o) => o.status === 'ASSIGNED_PENDING_ACCEPT'),
      '缺少此狀態的訂單，師傅端就無法驗收「區域級地址」',
    );
  });

  await t.test('⚠️ 有一個「已完成」的訂單（報酬驗收場景）', () => {
    assert.ok(data.ORDERS.some((o) => o.status === 'COMPLETED'));
  });
});

test('服務與商品', async (t) => {
  await t.test('服務有分類與價格', () => {
    for (const s of data.SERVICES) {
      assert.ok(s.serviceId && s.name && s.category);
      assert.ok(Number.isInteger(s.priceCents));
    }
  });

  await t.test('至少兩個分類（讓分類篩選可驗收）', () => {
    const categories = new Set(data.SERVICES.map((s) => s.category));
    assert.ok(categories.size >= 2, `只有 ${categories.size} 個分類，分類功能無法驗收`);
  });
});

test('管理員概覽（Q-C）', async (t) => {
  await t.test('四個數字齊全', () => {
    assert.deepEqual(
      Object.keys(data.ADMIN_OVERVIEW).sort(),
      ['pendingAssignCount', 'pendingRefundCount', 'todayOrderCount', 'todayRevenueCents'],
    );
  });

  await t.test('全是整數（金額為分）', () => {
    for (const [k, v] of Object.entries(data.ADMIN_OVERVIEW)) {
      assert.ok(Number.isInteger(v), `${k} 必須是整數`);
    }
  });
});
