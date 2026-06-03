import { prisma } from "@/lib/prisma";
import {
  adminRoleLabels,
  announcementStatusLabels,
  assetStatusLabels,
  assetTypeLabels,
  auctionStatusLabels,
  contractStatusLabels,
  contractTypeLabels,
  dryingListingStatusLabels,
  endUserTypeLabels,
  orgLevelLabels,
  paymentPurposeLabels,
  paymentStatusLabels,
  registrationStatusLabels,
  reservationStatusLabels,
} from "@/lib/labels";

export type DictOption = { value: string; label: string };

const builtinFallbackMaps: Record<string, Record<string, string>> = {
  asset_type: assetTypeLabels,
  asset_status: assetStatusLabels,
  auction_status: auctionStatusLabels,
  registration_status: registrationStatusLabels,
  announcement_status: announcementStatusLabels,
  drying_listing_status: dryingListingStatusLabels,
  reservation_status: reservationStatusLabels,
  contract_type: contractTypeLabels,
  contract_status: contractStatusLabels,
  payment_purpose: paymentPurposeLabels,
  payment_status: paymentStatusLabels,
  org_level: orgLevelLabels,
  admin_role: adminRoleLabels,
  user_type: endUserTypeLabels,
};

export async function getDictItems(categoryCode: string): Promise<DictOption[]> {
  const cat = await prisma.dictCategory.findUnique({
    where: { code: categoryCode },
    include: {
      items: {
        where: { enabled: true },
        orderBy: { sortOrder: "asc" },
      },
    },
  });
  if (!cat) return [];
  return cat.items.map((i) => ({ value: i.value, label: i.label }));
}

export async function getDictLabel(
  categoryCode: string,
  value: string,
): Promise<string> {
  const map = await getDictMap(categoryCode);
  return map[value] ?? value;
}

export async function getDictMap(
  categoryCode: string,
): Promise<Record<string, string>> {
  const items = await getDictItems(categoryCode);
  const map = Object.fromEntries(items.map((i) => [i.value, i.label]));
  if (Object.keys(map).length > 0) return map;
  return builtinFallbackMaps[categoryCode] ?? {};
}
