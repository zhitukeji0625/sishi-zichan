import { prisma } from "@/lib/prisma";
import {
  assetTypeLabels,
  assetStatusLabels,
  auctionStatusLabels,
  registrationStatusLabels,
  announcementStatusLabels,
  dryingListingStatusLabels,
  reservationStatusLabels,
  contractTypeLabels,
  contractStatusLabels,
  paymentPurposeLabels,
  paymentStatusLabels,
  orgLevelLabels,
  adminRoleLabels,
  endUserTypeLabels,
} from "@/lib/labels";

export type DictOption = { value: string; label: string };

const builtInMaps: Record<string, Record<string, string>> = {
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

function withBuiltInFallback(
  categoryCode: string,
  map: Record<string, string>,
): Record<string, string> {
  const fallback = builtInMaps[categoryCode];
  return fallback ? { ...fallback, ...map } : map;
}

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
  const items = await getDictItems(categoryCode);
  const fromDb = items.find((i) => i.value === value)?.label;
  if (fromDb) return fromDb;
  return builtInMaps[categoryCode]?.[value] ?? value;
}

export async function getDictMap(
  categoryCode: string,
): Promise<Record<string, string>> {
  const items = await getDictItems(categoryCode);
  const map = Object.fromEntries(items.map((i) => [i.value, i.label]));
  return withBuiltInFallback(categoryCode, map);
}
