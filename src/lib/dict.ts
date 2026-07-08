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

const builtinFallback: Record<string, Record<string, string>> = {
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

function fallbackItems(categoryCode: string): DictOption[] {
  const map = builtinFallback[categoryCode];
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
  if (!cat || cat.items.length === 0) return fallbackItems(categoryCode);
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
