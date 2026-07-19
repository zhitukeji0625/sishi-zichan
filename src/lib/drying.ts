import { prisma } from "@/lib/prisma";
import { format } from "date-fns";

/** Calendar day key for @db.Date fields (stored as UTC midnight). */
export function utcDayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function utcDateFromKey(key: string): Date {
  return new Date(`${key}T00:00:00.000Z`);
}

function eachUtcDay(start: Date, end: Date): string[] {
  const startKey = utcDayKey(start);
  const endKey = utcDayKey(end);
  if (endKey < startKey) return [];
  const days: string[] = [];
  let cur = utcDateFromKey(startKey);
  const endDate = utcDateFromKey(endKey);
  while (cur <= endDate) {
    days.push(utcDayKey(cur));
    cur = new Date(cur.getTime() + 86400000);
  }
  return days;
}

export async function getCapacityForDay(listingId: string, day: Date) {
  const dayKey = utcDayKey(day);
  const dayUtc = utcDateFromKey(dayKey);
  const rule = await prisma.dryingCapacityRule.findFirst({
    where: {
      listingId,
      startDate: { lte: dayUtc },
      endDate: { gte: dayUtc },
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
    const days = eachUtcDay(r.startDate, r.endDate);
    if (days.includes(dayKey)) booked += 1;
  }
  return { max, booked, available: Math.max(0, max - booked) };
}

export async function validateReservationRange(
  listingId: string,
  start: Date,
  end: Date,
  excludeReservationId?: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const days = eachUtcDay(start, end);
  if (days.length === 0) {
    return { ok: false, message: "结束日期不能早于开始日期" };
  }
  for (const dayKey of days) {
    const dayUtc = utcDateFromKey(dayKey);
    const rule = await prisma.dryingCapacityRule.findFirst({
      where: {
        listingId,
        startDate: { lte: dayUtc },
        endDate: { gte: dayUtc },
      },
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
      const rDays = eachUtcDay(r.startDate, r.endDate);
      if (rDays.includes(dayKey)) booked += 1;
    }
    if (booked >= max) {
      return { ok: false, message: `${format(dayUtc, "yyyy-MM-dd")} 已满` };
    }
  }
  return { ok: true };
}
