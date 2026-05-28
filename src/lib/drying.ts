import { prisma } from "@/lib/prisma";
import { startOfDay, eachDayOfInterval, format, addDays } from "date-fns";

/** 校验预约起止日是否在允许窗口内（今天起、不超过 maxAdvanceDays 天）。 */
export function validateBookingWindow(
  start: Date,
  end: Date,
  maxAdvanceDays: number,
  today: Date = new Date(),
): { ok: true } | { ok: false; message: string } {
  const startDay = startOfDay(start);
  const endDay = startOfDay(end);
  const todayDay = startOfDay(today);
  if (startDay < todayDay) {
    return { ok: false, message: "开始日期不能早于今天" };
  }
  const lastAllowed = addDays(todayDay, maxAdvanceDays);
  if (startDay > lastAllowed || endDay > lastAllowed) {
    return { ok: false, message: `预约日期不能超过 ${maxAdvanceDays} 天后` };
  }
  return { ok: true };
}

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
      status: { notIn: ["REJECTED", "CANCELLED"] },
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
): Promise<{ ok: true } | { ok: false; message: string }> {
  const listing = await prisma.dryingFieldListing.findUnique({
    where: { id: listingId },
    include: { bookingRules: true },
  });
  const maxAdvance = listing?.bookingRules[0]?.maxAdvanceDays ?? 7;
  const windowCheck = validateBookingWindow(start, end, maxAdvance);
  if (!windowCheck.ok) return windowCheck;

  const days = eachDayOfInterval({ start: startOfDay(start), end: startOfDay(end) });
  for (const day of days) {
    const { available } = await getCapacityForDay(listingId, day);
    if (available <= 0) {
      return { ok: false, message: `${format(day, "yyyy-MM-dd")} 已满` };
    }
  }
  return { ok: true };
}
