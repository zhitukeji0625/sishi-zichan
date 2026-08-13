import { prisma } from "@/lib/prisma";
import { startOfDay, eachDayOfInterval, format, addDays } from "date-fns";

const CAPACITY_STATUSES = [
  "APPROVED",
  "PENDING_PAYMENT",
  "PAID",
  "CONTRACT_PENDING",
  "ACTIVE",
  "COMPLETED",
] as const;

export async function getCapacityForDay(listingId: string, day: Date) {
  const d = startOfDay(day);
  const rule = await prisma.dryingCapacityRule.findFirst({
    where: {
      listingId,
      startDate: { lte: d },
      endDate: { gte: d },
    },
  });
  const max = rule?.maxPeople ?? 10;
  const reservations = await prisma.dryingReservation.findMany({
    where: {
      listingId,
      status: { in: [...CAPACITY_STATUSES] },
    },
  });
  let booked = 0;
  for (const r of reservations) {
    const days = eachDayOfInterval({
      start: startOfDay(r.startDate),
      end: startOfDay(r.endDate),
    });
    if (days.some((x) => format(x, "yyyy-MM-dd") === format(d, "yyyy-MM-dd"))) {
      booked += 1;
    }
  }
  return { max, booked, available: Math.max(0, max - booked) };
}

export async function validateBookingWindow(
  listingId: string,
  start: Date,
  end: Date,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const listing = await prisma.dryingFieldListing.findUnique({
    where: { id: listingId },
    include: { bookingRules: true },
  });
  if (!listing || listing.status !== "OPERATING") {
    return { ok: false, message: "晒场不存在或未运营" };
  }
  const today = startOfDay(new Date());
  const startDay = startOfDay(start);
  const endDay = startOfDay(end);
  if (startDay < today) {
    return { ok: false, message: "开始日期不能早于今天" };
  }
  const maxAdvance = listing.bookingRules[0]?.maxAdvanceDays ?? 7;
  const maxDate = addDays(today, maxAdvance);
  if (endDay > maxDate) {
    return { ok: false, message: `预约不能超过 ${maxAdvance} 天` };
  }
  return { ok: true };
}

export async function validateReservationRange(
  listingId: string,
  start: Date,
  end: Date,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const days = eachDayOfInterval({ start: startOfDay(start), end: startOfDay(end) });
  for (const day of days) {
    const { available } = await getCapacityForDay(listingId, day);
    if (available <= 0) {
      return { ok: false, message: `${format(day, "yyyy-MM-dd")} 已满` };
    }
  }
  return { ok: true };
}
