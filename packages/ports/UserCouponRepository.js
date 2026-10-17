'use strict';

/**
 * UserCouponRepository —— 使用者持有優惠券的持久化契約。
 *
 * UserCouponRecord（camelCase）：
 * ```js
 * {
 *   userCouponId, couponId, userId,
 *   status: 'unused' | 'used' | 'expired',
 *   validFrom, validTo, receivedAt,
 *   usedAt: number|null, orderId: string|null,
 * }
 * ```
 *
 * 唯一鍵：`(userId, couponId)`（同一張券不重複發放）。
 *
 * 實作：CloudDBUserCouponRepository（P7b）、InMemoryUserCouponRepository
 */
const UserCouponRepository = Object.freeze({
  name: 'UserCouponRepository',
  methods: Object.freeze([
    'findById',
    'findByUserAndCoupon',
    'listByUser',
    'listByCoupon',
    'save',
  ]),
  contract: Object.freeze({
    findById: '(userCouponId: string): Promise<UserCouponRecord|null>',
    findByUserAndCoupon: '(userId: string, couponId: string): Promise<UserCouponRecord|null>',
    /** 依 receivedAt 由新到舊 */
    listByUser: '(userId: string): Promise<UserCouponRecord[]>',
    /** 某張券的發放紀錄（供後台統計與避免重複發放） */
    listByCoupon: '(couponId: string): Promise<UserCouponRecord[]>',
    /** upsert（狀態流轉也走本方法） */
    save: '(userCoupon: UserCouponRecord): Promise<void>',
  }),
});

module.exports = { UserCouponRepository };
