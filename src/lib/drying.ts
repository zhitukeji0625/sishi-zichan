import { prisma } from "@/lib/prisma";
import { startOfDay, eachDayOfInterval, format, addDays } from "date-fns";
import type { Prisma } from "@prisma/client";

type Db = Prisma.TransactionClient | typeof prisma;

export async function getCapacityForDay(listingId: string, day: Date, db: Db = prisma) {
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
  db: Db = prisma,
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

export async function validateBookingWindow(
  listingId: string,
  start: Date,
  end: Date,
  db: Db = prisma,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const listing = await db.dryingFieldListing.findUnique({
    where: { id: listingId },
    include: { bookingRules: true },
  });
  if (!listing) return { ok: false, message: "晒场不存在" };
  const rule = listing.bookingRules[0];
  const maxAdvance = rule?.maxAdvanceDays ?? 7;
  const today = startOfDay(new Date());
  const horizon = addDays(today, maxAdvance);
  const startDay = startOfDay(start);
  const endDay = startOfDay(end);
  if (startDay < today) return { ok: false, message: "开始日期不能早于今天" };
  if (endDay > horizon) return { ok: false, message: `最多可提前预约 ${maxAdvance} 天` };
  if (rule?.holidayJson) {
    try {
      const holidays = JSON.parse(rule.holidayJson) as unknown;
      if (Array.isArray(holidays)) {
        for (const day of eachDayOfInterval({ start: startDay, end: endDay })) {
          const ds = format(day, "yyyy-MM-dd");
          if (holidays.includes(ds)) {
            return { ok: false, message: `${ds} 为休业日不可预约` };
          }
        }
      }
    } catch {
      /* ignore invalid holiday config */
    }
  }
  return { ok: true };
}
