import { prisma } from "@/lib/prisma";
import { startOfDay, eachDayOfInterval, format } from "date-fns";

/** Returns days in [start, end] inclusive; empty array if end < start. */
function safeEachDayOfInterval(start: Date, end: Date): Date[] {
  const s = startOfDay(start);
  const e = startOfDay(end);
  if (e < s) return [];
  return eachDayOfInterval({ start: s, end: e });
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
    const days = safeEachDayOfInterval(r.startDate, r.endDate);
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
  const days = safeEachDayOfInterval(start, end);
  if (days.length === 0) {
    return { ok: false, message: "结束日期不能早于开始日期" };
  }
  for (const day of days) {
    const { available } = await getCapacityForDay(listingId, day);
    if (available <= 0) {
      return { ok: false, message: `${format(day, "yyyy-MM-dd")} 已满` };
    }
  }
  return { ok: true };
}
