import { prisma } from "@/lib/prisma";
import { startOfDay, eachDayOfInterval, format, addDays } from "date-fns";

/** Parse yyyy-MM-dd as local midnight (avoids UTC offset issues). */
export function parseLocalDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d);
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
    const rStart = startOfDay(r.startDate);
    const rEnd = startOfDay(r.endDate);
    if (rStart > rEnd) continue;
    const days = eachDayOfInterval({ start: rStart, end: rEnd });
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
  maxAdvanceDays?: number,
): Promise<{ ok: true } | { ok: false; message: string }> {
  if (maxAdvanceDays != null) {
    const today = startOfDay(new Date());
    const latest = addDays(today, maxAdvanceDays);
    if (startOfDay(start) > latest || startOfDay(end) > latest) {
      return { ok: false, message: `仅可预约未来 ${maxAdvanceDays} 天内` };
    }
  }
  const days = eachDayOfInterval({ start: startOfDay(start), end: startOfDay(end) });
  for (const day of days) {
    const { available } = await getCapacityForDay(listingId, day);
    if (available <= 0) {
      return { ok: false, message: `${format(day, "yyyy-MM-dd")} 已满` };
    }
  }
  return { ok: true };
}
