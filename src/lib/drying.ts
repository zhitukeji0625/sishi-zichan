import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { startOfDay, eachDayOfInterval, format, parse, isValid } from "date-fns";

/** Parse yyyy-MM-dd as local calendar date (avoids UTC midnight shift). */
export function parseLocalDate(dateStr: string): Date | null {
  const d = parse(dateStr, "yyyy-MM-dd", new Date());
  if (!isValid(d)) return null;
  return startOfDay(d);
}

export async function getCapacityForDay(
  listingId: string,
  day: Date,
  db: Prisma.TransactionClient | typeof prisma = prisma,
) {
  const d = startOfDay(day);
  const rule = await db.dryingCapacityRule.findFirst({
    where: {
      listingId,
      startDate: { lte: d },
      endDate: { gte: d },
    },
  });
  const max = rule?.maxPeople ?? 10;
  const reservations = await db.dryingReservation.findMany({
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
  db: Prisma.TransactionClient | typeof prisma = prisma,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const days = eachDayOfInterval({ start: startOfDay(start), end: startOfDay(end) });
  for (const day of days) {
    const { available } = await getCapacityForDay(listingId, day, db);
    if (available <= 0) {
      return { ok: false, message: `${format(day, "yyyy-MM-dd")} 已满` };
    }
  }
  return { ok: true };
}
