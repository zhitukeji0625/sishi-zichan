import { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { startOfDay, eachDayOfInterval, format, addDays } from "date-fns";

type DbClient = PrismaClient | Prisma.TransactionClient;

export async function getCapacityForDay(listingId: string, day: Date, db: DbClient = prisma) {
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
  db: DbClient = prisma,
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

export async function validateAdvanceDays(
  listingId: string,
  start: Date,
  end: Date,
  db: DbClient = prisma,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const listing = await db.dryingFieldListing.findUnique({
    where: { id: listingId },
    include: { bookingRules: true },
  });
  const maxAdvance = listing?.bookingRules[0]?.maxAdvanceDays ?? 7;
  const today = startOfDay(new Date());
  const horizon = addDays(today, maxAdvance);
  if (startOfDay(start) < today) {
    return { ok: false, message: "开始日期不能早于今天" };
  }
  if (startOfDay(end) > horizon) {
    return { ok: false, message: `预约最远不超过 ${maxAdvance} 天` };
  }
  return { ok: true };
}
