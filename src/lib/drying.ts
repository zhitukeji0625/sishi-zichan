import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { dbClient, type DbClient } from "@/lib/db";
import { startOfDay, eachDayOfInterval, format, addDays } from "date-fns";

export async function getCapacityForDay(listingId: string, day: Date, tx?: DbClient) {
  const db = dbClient(tx);
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
  tx?: DbClient,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const days = eachDayOfInterval({ start: startOfDay(start), end: startOfDay(end) });
  for (const day of days) {
    const { available } = await getCapacityForDay(listingId, day, tx);
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
  tx?: DbClient,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const db = dbClient(tx);
  const listing = await db.dryingFieldListing.findUnique({
    where: { id: listingId },
    include: { bookingRules: true },
  });
  if (!listing) return { ok: false, message: "晒场不存在" };
  const rule = listing.bookingRules[0];
  const maxAdvance = rule?.maxAdvanceDays ?? 7;
  const today = startOfDay(new Date());
  const horizon = startOfDay(addDays(today, maxAdvance));
  const startDay = startOfDay(start);
  const endDay = startOfDay(end);
  if (startDay < today) return { ok: false, message: "开始日期不能早于今天" };
  if (endDay > horizon) {
    return { ok: false, message: `预约日期不能超过未来 ${maxAdvance} 天` };
  }
  if (rule?.holidayJson) {
    try {
      const holidays = JSON.parse(rule.holidayJson) as unknown;
      if (Array.isArray(holidays)) {
        const blocked = new Set(
          holidays.filter((h): h is string => typeof h === "string").map((h) => h.slice(0, 10)),
        );
        for (const day of eachDayOfInterval({ start: startDay, end: endDay })) {
          const key = format(day, "yyyy-MM-dd");
          if (blocked.has(key)) return { ok: false, message: `${key} 为不可预约日期` };
        }
      }
    } catch {
      /* ignore malformed holidayJson */
    }
  }
  return { ok: true };
}

export async function createDryingReservation(params: {
  listingId: string;
  endUserId: string;
  start: Date;
  end: Date;
}) {
  const { listingId, endUserId, start, end } = params;
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw(
      Prisma.sql`SELECT id FROM DryingFieldListing WHERE id = ${listingId} FOR UPDATE`,
    );
    const booking = await validateBookingWindow(listingId, start, end, tx);
    if (!booking.ok) throw new Error(booking.message);
    const capacity = await validateReservationRange(listingId, start, end, tx);
    if (!capacity.ok) throw new Error(capacity.message);
    return tx.dryingReservation.create({
      data: {
        listingId,
        endUserId,
        startDate: start,
        endDate: end,
        status: "PENDING_REVIEW",
      },
    });
  });
}
