'use strict';

/**
 * @repair/domain —— 領域層公開介面。
 *
 * 本層**不得**依賴任何外部世界（微信雲 SDK、資料庫、HTTP、系統時間）。
 * 由 scripts/check-layering.js 機械化保證。
 *
 * P0 階段僅建立狀態機（改造風險最高、也最該先做對的部分）。
 * 完整聚合（Order、OrderItem）與策略（ProfitSharingPolicy、AddressDisclosurePolicy…）
 * 於 P4 建立，見 docs/02-實施計畫.md §5。
 */

// ── 值物件基礎 ──
const { ValueObject } = require('./shared/ValueObject');
const { canonicalJSON } = require('./shared/canonicalJSON');
const assertions = require('./shared/assertions');

// ── 領域值物件 ──
const { MaskedPhone } = require('./shared/MaskedPhone');
const { PhoneNumber, COUNTRY_CODE } = require('./shared/PhoneNumber');
const { Address } = require('./shared/Address');
const { AddressView, DisclosureLevel } = require('./shared/AddressView');
const { OrderNo } = require('./shared/OrderNo');
const { CommissionRate, BP_DENOMINATOR } = require('./shared/CommissionRate');
const { AmountChangeReason, ReasonCode } = require('./audit/AmountChangeReason');
const { ProfitSharingTerms, SharingBase } = require('./settlement/ProfitSharingTerms');

// ── 訂單聚合 ──
const { Order } = require('./order/Order');
const { OrderItem, ItemType, FeeType } = require('./order/OrderItem');
const { OrderStateMachine } = require('./order/OrderStateMachine');
const { OrderStatusLog } = require('./order/OrderStatusLog');
const { OrderSnapshot } = require('./order/OrderSnapshot');
const { priceItems, sumItemsWhere } = require('./order/PricingService');

// ── 優惠券 ──
const { Coupon } = require('./coupon/Coupon');
const { UserCoupon, UserCouponStatus, USER_COUPON_STATUSES } = require('./coupon/UserCoupon');

// ── 策略 ──
const { discloseFor, disclosureStartAt } = require('./order/policies/AddressDisclosurePolicy');
const { maskFor, maskAlways } = require('./order/policies/ContactMaskingPolicy');
const { resolveChannel, ContactChannel, ChannelDecision } = require('./order/policies/ContactChannelPolicy');
const { calculate: calculateProfitShare } = require('./settlement/ProfitSharingPolicy');
const { RefundScope, RefundScopeType } = require('./refund/RefundScope');
const { planRefund, previewAmounts } = require('./refund/RefundPolicy');
const AuditChain = require('./audit/AuditChain');
const { ReconciliationThresholds } = require('./reconciliation/ReconciliationThresholds');
const {
  compare: reconcileCompare,
  shouldFreezeSettlement,
  DiffType,
  ReconciliationTier,
} = require('./reconciliation/ReconciliationService');

// ── 存取控制 ──
const { Permission, ALL_KEYS: ALL_PERMISSION_KEYS, byKey: permissionByKey } = require('./access/Permission');
const { Decision, Reason } = require('./access/Decision');
const { PermissionGroup, permissionsOfGroups } = require('./access/PermissionGroupMatrix');
const {
  ROLE_PERMISSIONS,
  TECHNICIAN_FORBIDDEN,
  roleHas,
  effectivePermissions,
} = require('./access/RolePermissionMatrix');
const { can, canBool, allowedPermissions } = require('./access/AccessPolicy');
const { ApprovalPolicy, APPROVAL_RULES, isPriceChangeOverThreshold } = require('./access/ApprovalPolicy');

// ── 狀態機 ──
const OrderStatus = require('./order/OrderStatus');

module.exports = {
  // 基礎
  ValueObject,
  canonicalJSON,
  ...assertions,
  // 值物件
  MaskedPhone,
  PhoneNumber,
  COUNTRY_CODE,
  Address,
  AddressView,
  DisclosureLevel,
  OrderNo,
  CommissionRate,
  BP_DENOMINATOR,
  AmountChangeReason,
  ReasonCode,
  ProfitSharingTerms,
  SharingBase,
  // 訂單聚合
  Order,
  OrderItem,
  ItemType,
  FeeType,
  OrderStateMachine,
  OrderStatusLog,
  OrderSnapshot,
  priceItems,
  sumItemsWhere,
  // 優惠券
  Coupon,
  UserCoupon,
  UserCouponStatus,
  USER_COUPON_STATUSES,
  // 策略
  discloseFor,
  disclosureStartAt,
  maskFor,
  maskAlways,
  resolveChannel,
  ContactChannel,
  ChannelDecision,
  calculateProfitShare,
  RefundScope,
  RefundScopeType,
  planRefund,
  previewAmounts,
  AuditChain,
  ReconciliationThresholds,
  reconcileCompare,
  shouldFreezeSettlement,
  DiffType,
  ReconciliationTier,
  // 存取控制
  Permission,
  ALL_PERMISSION_KEYS,
  permissionByKey,
  Decision,
  Reason,
  PermissionGroup,
  permissionsOfGroups,
  ROLE_PERMISSIONS,
  TECHNICIAN_FORBIDDEN,
  roleHas,
  effectivePermissions,
  can,
  canBool,
  allowedPermissions,
  ApprovalPolicy,
  APPROVAL_RULES,
  isPriceChangeOverThreshold,
  // 狀態機
  OrderStatus,
};
