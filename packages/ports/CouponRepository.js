'use strict';

/**
 * CouponRepository —— 優惠券定義的持久化契約。
 *
 * CouponRecord（camelCase）：
 * ```js
 * {
 *   couponId, name, amountCents, minSpendCents,
 *   validFrom, validTo, isActive,
 *   totalQuantity: number|null, createdAt: number|null,
 * }
 * ```
 *
 * ⚠️ 這裡存的是**券的定義**；使用者手上的券在 `UserCouponRepository`。
 *
 * 實作：CloudDBCouponRepository（P7b）、InMemoryCouponRepository
 */
const CouponRepository = Object.freeze({
  name: 'CouponRepository',
  methods: Object.freeze(['findById', 'listAll', 'save']),
  contract: Object.freeze({
    findById: '(couponId: string): Promise<CouponRecord|null>',
    /** 全部券（含停用），依 createdAt 由新到舊 */
    listAll: '(): Promise<CouponRecord[]>',
    /** upsert */
    save: '(coupon: CouponRecord): Promise<void>',
  }),
});

module.exports = { CouponRepository };
