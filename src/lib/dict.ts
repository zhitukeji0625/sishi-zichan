import { prisma } from "@/lib/prisma";
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
  contractTypeLabels,
  contractStatusLabels,
  paymentPurposeLabels,
  paymentStatusLabels,
  endUserTypeLabels,
} from "@/lib/labels";

export type DictOption = { value: string; label: string };

const builtInMaps: Record<string, Record<string, string>> = {
  asset_type: assetTypeLabels as Record<string, string>,
  asset_status: assetStatusLabels as Record<string, string>,
  admin_role: adminRoleLabels as Record<string, string>,
  org_level: orgLevelLabels as Record<string, string>,
  auction_status: auctionStatusLabels as Record<string, string>,
  registration_status: registrationStatusLabels as Record<string, string>,
  announcement_status: announcementStatusLabels as Record<string, string>,
  drying_listing_status: dryingListingStatusLabels as Record<string, string>,
  reservation_status: reservationStatusLabels as Record<string, string>,
  contract_type: contractTypeLabels as Record<string, string>,
  contract_status: contractStatusLabels as Record<string, string>,
  payment_purpose: paymentPurposeLabels as Record<string, string>,
  payment_status: paymentStatusLabels as Record<string, string>,
  user_type: endUserTypeLabels as Record<string, string>,
};

function builtInItems(categoryCode: string): DictOption[] {
  const map = builtInMaps[categoryCode];
  if (!map) return [];
  return Object.entries(map).map(([value, label]) => ({ value, label }));
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
  if (!cat || cat.items.length === 0) return builtInItems(categoryCode);
  return cat.items.map((i) => ({ value: i.value, label: i.label }));
}

export async function getDictLabel(
  categoryCode: string,
  value: string,
): Promise<string> {
  const items = await getDictItems(categoryCode);
  return items.find((i) => i.value === value)?.label ?? value;
}

export async function getDictMap(
  categoryCode: string,
): Promise<Record<string, string>> {
  const items = await getDictItems(categoryCode);
  return Object.fromEntries(items.map((i) => [i.value, i.label]));
}
