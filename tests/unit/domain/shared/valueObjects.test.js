'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { ValueObject } = require('../../../../packages/domain/shared/ValueObject');
const { AddressView, DisclosureLevel } = require('../../../../packages/domain/shared/AddressView');
const { Address } = require('../../../../packages/domain/shared/Address');
const { OrderNo } = require('../../../../packages/domain/shared/OrderNo');
const { CommissionRate, BP_DENOMINATOR } = require('../../../../packages/domain/shared/CommissionRate');
const { AmountChangeReason, ReasonCode } = require('../../../../packages/domain/audit/AmountChangeReason');
const { ProfitSharingTerms, SharingBase } = require('../../../../packages/domain/settlement/ProfitSharingTerms');
const { Money, Rounding } = require('../../../../packages/shared-kernel/Money');

test('ValueObject 基底語意', async (t) => {
  class Stub extends ValueObject {
    constructor(v) {
      super({ v });
    }
    get v() {
      return this.props.v;
    }
    toJSON() {
      return { v: this.props.v };
    }
  }

  await t.test('以值比較，且比對型別', () => {
    class Other extends Stub {}
    assert.ok(new Stub(1).equals(new Stub(1)));
    assert.ok(!new Stub(1).equals(new Stub(2)));
    assert.ok(!new Stub(1).equals(new Other(1)), '不同類別即使內容相同也不相等');
    assert.ok(!new Stub(1).equals({ v: 1 }), '與純物件不相等');
  });

  await t.test('props 深凍結，無法偷改', () => {
    const vo = new Stub({ nested: { x: 1 } });
    assert.throws(() => {
      'use strict';
      vo.props.v = 2;
    });
    assert.throws(() => {
      'use strict';
      vo.props.v.nested.x = 2;
    });
  });

  await t.test('⚠️ 子類別不得賦予公開屬性（強制狀態集中在 props）', () => {
    class Bad extends ValueObject {
      constructor() {
        super({ a: 1 });
        this.publicField = 'x'; // 應拋錯
      }
    }
    assert.throws(() => new Bad(), TypeError);
  });

  await t.test('外部傳入的物件被深拷貝（改外部不影響值物件）', () => {
    const external = { nested: { n: 1 } };
    const vo = new Stub(external); // Stub 會包成 { v: external }
    external.nested.n = 999;
    assert.equal(vo.props.v.nested.n, 1, '深拷貝必須遞迴，巢狀物件也要隔離');
  });
});

test('AddressView：分級揭露的型別保證', async (t) => {
  await t.test('district() 的 detailAddress 保證為 null', () => {
    const v = AddressView.district({ province: '廣東省', city: '深圳市', district: '寶安區', street: '沙井街道' });
    assert.equal(v.level, DisclosureLevel.DISTRICT);
    assert.equal(v.detailAddress, null);
    assert.equal(v.isFull, false);
  });

  await t.test('⚠️ 即使透過建構子硬塞門牌，DISTRICT 也會被擋下', () => {
    assert.throws(
      () => new AddressView({ level: 'DISTRICT', province: 'x', city: 'y', district: 'z', detailAddress: '門牌' }),
      Error,
    );
  });

  await t.test('full() 才有門牌', () => {
    const v = AddressView.full({ province: '廣東省', city: '深圳市', district: '寶安區', detailAddress: '中心路28號' });
    assert.equal(v.isFull, true);
    assert.equal(v.detailAddress, '中心路28號');
  });

  await t.test('toSummary 只到街道，不含門牌', () => {
    const v = AddressView.district({ province: '廣東省', city: '深圳市', district: '寶安區', street: '沙井街道' });
    assert.equal(v.toSummary(), '廣東省深圳市寶安區沙井街道');
    assert.equal(v.toSummary().includes('號'), false);
  });

  await t.test('❗ 建構子直接使用時，非法 level 被擋', () => {
    assert.throws(
      () => new AddressView({ level: 'SUPER', province: 'x', city: 'y', district: 'z' }),
      Error,
    );
  });

  await t.test('factory 會**覆寫**傳入的 level（讓錯誤的組合不可表達）', () => {
    // 這是刻意的：factory 的契約是「由我決定層級」。
    // 呼叫端即使傳了 level，也無法影響結果 —— 錯誤的組合在呼叫層就寫不出來。
    const v = AddressView.full({ level: 'DISTRICT', province: 'x', city: 'y', district: 'z', detailAddress: '門牌' });
    assert.equal(v.level, DisclosureLevel.FULL);
    assert.equal(v.detailAddress, '門牌');

    const d = AddressView.district({ level: 'FULL', province: 'x', city: 'y', district: 'z' });
    assert.equal(d.level, DisclosureLevel.DISTRICT);
    assert.equal(d.detailAddress, null);
  });
});

test('Address：降級與升級', async (t) => {
  const addr = new Address({
    province: '廣東省', city: '深圳市', district: '寶安區', street: '沙井街道', detailAddress: '中心路28號3棟5B',
  });

  await t.test('toDistrictView 去掉門牌', () => {
    const v = addr.toDistrictView();
    assert.equal(v.detailAddress, null);
    assert.equal(v.district, '寶安區');
  });

  await t.test('toFullView 保留門牌', () => {
    assert.equal(addr.toFullView().detailAddress, '中心路28號3棟5B');
  });

  await t.test('必填欄位缺一不可', () => {
    assert.throws(() => new Address({ province: 'x', city: 'y', district: 'z' }), Error);
  });
});

test('OrderNo', async (t) => {
  await t.test('合法格式', () => {
    const no = new OrderNo('R20261016000001');
    assert.equal(no.value, 'R20261016000001');
    assert.equal(no.datePart, '20261016');
    assert.equal(no.sequencePart, '000001');
  });

  await t.test('非法格式', () => {
    for (const bad of ['R2026101', 'X20261016000001', 'R2026101600000', '', 'R2026101600000A']) {
      assert.throws(() => new OrderNo(bad), Error, `應拒絕 ${bad}`);
    }
  });
});

test('CommissionRate', async (t) => {
  await t.test('範圍與轉換', () => {
    assert.equal(CommissionRate.fromBp(8000).percent, 80);
    assert.equal(CommissionRate.fromPercent(80).bp, 8000);
    assert.equal(CommissionRate.fromBp(0).isZero(), true);
  });

  await t.test('超出 0–10000 bp 被擋', () => {
    assert.throws(() => CommissionRate.fromBp(-1), Error);
    assert.throws(() => CommissionRate.fromBp(BP_DENOMINATOR + 1), Error);
    assert.throws(() => CommissionRate.fromBp(80.5), Error);
  });

  await t.test('complement 與 addUpTo100', () => {
    const tech = CommissionRate.fromBp(8000);
    assert.equal(tech.complement().bp, 2000);
    assert.equal(tech.addUpTo100(tech.complement()), true);
    assert.equal(tech.addUpTo100(CommissionRate.fromBp(1500)), false);
  });
});

test('ProfitSharingTerms：分潤比例必須恰好 100%', async (t) => {
  const valid = {
    base: SharingBase.SERVICE_FEE, technicianRateBp: 8000, platformRateBp: 2000,
    roundingMode: Rounding.FLOOR_TO_CENT, termsVersion: 'v1',
  };

  await t.test('合法', () => {
    const terms = new ProfitSharingTerms(valid);
    assert.equal(terms.technicianRateBp, 8000);
    assert.equal(terms.includesMaterialFee, false, '現行決策：材料費不參與分潤');
  });

  await t.test('⚠️ 總和不等於 100% 一律擋下（防止分潤無中生有或漏掉）', () => {
    assert.throws(() => new ProfitSharingTerms({ ...valid, platformRateBp: 1500 }), Error);
    assert.throws(() => new ProfitSharingTerms({ ...valid, platformRateBp: 3000 }), Error);
  });

  await t.test('base 參數化：改成含材料費只需換一個值', () => {
    const terms = new ProfitSharingTerms({ ...valid, base: SharingBase.SERVICE_FEE_PLUS_MATERIAL });
    assert.equal(terms.includesMaterialFee, true);
  });

  await t.test('未知 base / roundingMode 被擋', () => {
    assert.throws(() => new ProfitSharingTerms({ ...valid, base: 'WHATEVER' }), Error);
    assert.throws(() => new ProfitSharingTerms({ ...valid, roundingMode: 'GUESS' }), Error);
  });
});

test('AmountChangeReason：凍結的列舉', async (t) => {
  await t.test('合法原因碼', () => {
    assert.equal(new AmountChangeReason(ReasonCode.REFUND_FULL).code, 'REFUND_FULL');
    assert.equal(new AmountChangeReason(ReasonCode.VOID_FRAUD_SUSPECTED, '疑似詐欺').note, '疑似詐欺');
  });

  await t.test('未知原因碼被擋（不接受任意字串）', () => {
    assert.throws(() => new AmountChangeReason('亂寫'), Error);
    assert.throws(() => new AmountChangeReason(''), Error);
  });

  await t.test('isCustomerFacing 分類正確', () => {
    assert.equal(new AmountChangeReason(ReasonCode.REFUND_FULL).isCustomerFacing(), true);
    assert.equal(new AmountChangeReason(ReasonCode.VOID_UNPAID).isCustomerFacing(), true);
    assert.equal(new AmountChangeReason(ReasonCode.PROFIT_SHARING_EXECUTED).isCustomerFacing(), false);
  });
});
