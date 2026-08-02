import type { AssetType, AssetStatus, AdminRole, OrgLevel, AuctionProjectStatus, RegistrationStatus, AnnouncementStatus, DryingListingStatus, ReservationStatus, ContractType, ContractStatus, PaymentPurpose, PaymentStatus, EndUserType } from "@prisma/client";

export const assetTypeLabels: Record<AssetType, string> = {
  WORKSHOP: "厂房",
  MACHINERY: "农机设备",
  FACILITY: "农业设施",
  LAND: "闲置土地",
  DRYING_FIELD: "晒场",
  OTHER: "其他",
};

export const assetStatusLabels: Record<AssetStatus, string> = {
  IDLE: "闲置",
  IN_USE: "在用",
  MAINTENANCE: "维护中",
};

export const adminRoleLabels: Record<AdminRole, string> = {
  DIVISION_ADMIN: "师级管理员",
  REGIMENT_ADMIN: "团级管理员",
  COMPANY_ADMIN: "连队管理员",
};

export const orgLevelLabels: Record<OrgLevel, string> = {
  DIVISION: "师",
  REGIMENT: "团",
  COMPANY: "连",
};

export const auctionStatusLabels: Record<AuctionProjectStatus, string> = {
  DRAFT: "草稿",
  SCHEDULED: "待开始",
  LIVE: "进行中",
  ENDED: "已结束",
  CANCELLED: "已取消",
};

export const registrationStatusLabels: Record<RegistrationStatus, string> = {
  PENDING: "待审核",
  APPROVED: "已通过",
  REJECTED: "已驳回",
};

export const announcementStatusLabels: Record<AnnouncementStatus, string> = {
  DRAFT: "草稿",
  PENDING_REVIEW: "待审核",
  PUBLISHED: "已发布",
  WITHDRAWN: "已撤回",
};

export const dryingListingStatusLabels: Record<DryingListingStatus, string> = {
  OPERATING: "运营中",
  MAINTENANCE: "维护中",
  PAUSED: "已暂停",
  OFFLINE: "已下线",
};

export const reservationStatusLabels: Record<ReservationStatus, string> = {
  PENDING_REVIEW: "待审核",
  APPROVED: "已通过",
  REJECTED: "已驳回",
  PENDING_PAYMENT: "待支付",
  PAID: "已支付",
  CONTRACT_PENDING: "待签合同",
  ACTIVE: "使用中",
  CANCELLED: "已取消",
  COMPLETED: "已完成",
};

export const contractTypeLabels: Record<ContractType, string> = {
  AUCTION_LEASE: "竞拍租赁",
  DRYING_LEASE: "晒场租赁",
};

export const contractStatusLabels: Record<ContractStatus, string> = {
  DRAFT: "待签署",
  SIGNED: "已签署",
  EXPIRED: "已过期",
};

export const paymentPurposeLabels: Record<PaymentPurpose, string> = {
  AUCTION_DEPOSIT: "竞拍保证金",
  AUCTION_RENT: "竞拍租金",
  DRYING_DEPOSIT: "晒场保证金",
  DRYING_RENT: "晒场租金",
};

export const paymentStatusLabels: Record<PaymentStatus, string> = {
  PENDING: "待支付",
  SUCCESS: "成功",
  FAILED: "失败",
  REFUNDED: "已退款",
};

export const endUserTypeLabels: Record<EndUserType, string> = {
  PERSON: "个人",
  COMPANY: "企业",
};

/** Built-in dict fallbacks when DB seed has not run yet. */
export const builtinDictFallbacks: Record<string, Record<string, string>> = {
  asset_type: assetTypeLabels,
  asset_status: assetStatusLabels,
  admin_role: adminRoleLabels,
  org_level: orgLevelLabels,
  auction_status: auctionStatusLabels,
  registration_status: registrationStatusLabels,
  announcement_status: announcementStatusLabels,
  drying_listing_status: dryingListingStatusLabels,
  reservation_status: reservationStatusLabels,
  contract_type: contractTypeLabels,
  contract_status: contractStatusLabels,
  payment_purpose: paymentPurposeLabels,
  payment_status: paymentStatusLabels,
  user_type: endUserTypeLabels,
};
