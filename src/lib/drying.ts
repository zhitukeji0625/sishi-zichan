import { prisma } from "@/lib/prisma";
import { startOfDay, eachDayOfInterval, format, addDays } from "date-fns";

export async function getMaxAdvanceDays(listingId: string) {
  const rule = await prisma.dryingBookingRule.findFirst({
    where: { listingId },
    orderBy: { id: "desc" },
  });
  return rule?.maxAdvanceDays ?? 7;
}

export function validateAdvanceWindow(
  start: Date,
  maxAdvanceDays: number,
  now = new Date(),
): { ok: true } | { ok: false; message: string } {
  const today = startOfDay(now);
  const horizon = addDays(today, maxAdvanceDays);
  if (startOfDay(start) > horizon) {
    return { ok: false, message: `仅可预约未来 ${maxAdvanceDays} 天内` };
  }
  if (startOfDay(start) < today) {
    return { ok: false, message: "开始日期不能早于今天" };
  }
  return { ok: true };
}

export async function getCapacityForDay(
  listingId: string,
  day: Date,
  excludeReservationId?: string,
) {
  const d = startOfDay(day);
  const rule = await prisma.dryingCapacityRule.findFirst({
    where: {
      listingId,
      startDate: { lte: d },
      endDate: { gte: d },
    },
    orderBy: { startDate: "desc" },
  });
  const max = rule?.maxPeople ?? 10;
  const reservations = await prisma.dryingReservation.findMany({
    where: {
      listingId,
      status: { notIn: ["REJECTED", "CANCELLED"] },
      ...(excludeReservationId ? { id: { not: excludeReservationId } } : {}),
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

export async function validateReservationRange(
  listingId: string,
  start: Date,
  end: Date,
  excludeReservationId?: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const days = eachDayOfInterval({ start: startOfDay(start), end: startOfDay(end) });
  for (const day of days) {
    const { available } = await getCapacityForDay(listingId, day, excludeReservationId);
    if (available <= 0) {
      return { ok: false, message: `${format(day, "yyyy-MM-dd")} 已满` };
    }
  }
  return { ok: true };
}
