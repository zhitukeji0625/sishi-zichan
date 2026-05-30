import {
  assetTypeLabels,
  assetStatusLabels,
  adminRoleLabels,
  orgLevelLabels,
  auctionStatusLabels,
  registrationStatusLabels,
  announcementStatusLabels,
  dryingListingStatusLabels,
  reservationStatusLabels,
  paymentPurposeLabels,
  paymentStatusLabels,
} from "@/lib/labels";
import type { DictOption } from "@/lib/dict";

/** Built-in dictionary categories used when DB has no rows yet. */
export const BUILTIN_DICT_CATEGORIES: Record<
  string,
  { name: string; labels: Record<string, string> }
> = {
  asset_type: { name: "资产类型", labels: assetTypeLabels },
  asset_status: { name: "资产状态", labels: assetStatusLabels },
  admin_role: { name: "管理员角色", labels: adminRoleLabels },
  org_level: { name: "组织层级", labels: orgLevelLabels },
  auction_status: { name: "竞拍状态", labels: auctionStatusLabels },
  registration_status: { name: "报名状态", labels: registrationStatusLabels },
  announcement_status: { name: "公告状态", labels: announcementStatusLabels },
  drying_listing_status: { name: "晒场状态", labels: dryingListingStatusLabels },
  reservation_status: { name: "预约状态", labels: reservationStatusLabels },
  payment_purpose: { name: "支付用途", labels: paymentPurposeLabels },
  payment_status: { name: "支付状态", labels: paymentStatusLabels },
};

export function builtinDictItems(categoryCode: string): DictOption[] {
  const cat = BUILTIN_DICT_CATEGORIES[categoryCode];
  if (!cat) return [];
  return Object.entries(cat.labels).map(([value, label]) => ({
    value,
    label,
  }));
}

export function builtinDictMap(categoryCode: string): Record<string, string> {
  const cat = BUILTIN_DICT_CATEGORIES[categoryCode];
  if (!cat) return {};
  return { ...cat.labels };
}
