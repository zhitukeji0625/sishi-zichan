import { prisma } from "@/lib/prisma";
import { startOfDay, eachDayOfInterval, format, addDays } from "date-fns";
import type { Prisma } from "@prisma/client";

type Tx = Prisma.TransactionClient;

export async function getCapacityForDay(listingId: string, day: Date, tx: Tx = prisma) {
  const d = startOfDay(day);
  const rule = await tx.dryingCapacityRule.findFirst({
    where: {
      listingId,
      startDate: { lte: d },
      endDate: { gte: d },
    },
  });
  const max = rule?.maxPeople ?? 10;
  const reservations = await tx.dryingReservation.findMany({
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

export async function validateBookingRules(
  listingId: string,
  start: Date,
  end: Date,
  tx: Tx = prisma,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const listing = await tx.dryingFieldListing.findUnique({
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
  if (startDay < today) {
    return { ok: false, message: "不能预约过去的日期" };
  }
  if (endDay > horizon) {
    return { ok: false, message: `最多可提前 ${maxAdvance} 天预约` };
  }
  if (rule?.holidayJson) {
    try {
      const holidays: string[] = JSON.parse(rule.holidayJson);
      const days = eachDayOfInterval({ start: startDay, end: endDay });
      for (const day of days) {
        const ds = format(day, "yyyy-MM-dd");
        if (holidays.includes(ds)) {
          return { ok: false, message: `${ds} 为休假日不可预约` };
        }
      }
    } catch {
      /* ignore invalid holidayJson */
    }
  }
  return { ok: true };
}

export async function validateReservationRange(
  listingId: string,
  start: Date,
  end: Date,
  tx: Tx = prisma,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const booking = await validateBookingRules(listingId, start, end, tx);
  if (!booking.ok) return booking;
  const days = eachDayOfInterval({ start: startOfDay(start), end: startOfDay(end) });
  for (const day of days) {
    const { available } = await getCapacityForDay(listingId, day, tx);
    if (available <= 0) {
      return { ok: false, message: `${format(day, "yyyy-MM-dd")} 已满` };
    }
  }
  return { ok: true };
}

export async function createDryingReservation(params: {
  listingId: string;
  endUserId: string;
  startDate: Date;
  endDate: Date;
}) {
  const { listingId, endUserId, startDate, endDate } = params;
  return prisma.$transaction(async (tx) => {
    const listing = await tx.dryingFieldListing.findUnique({ where: { id: listingId } });
    if (!listing || listing.status !== "OPERATING") {
      throw new Error("晒场不存在或未运营");
    }
    const check = await validateReservationRange(listingId, startDate, endDate, tx);
    if (!check.ok) throw new Error(check.message);
    return tx.dryingReservation.create({
      data: {
        listingId,
        endUserId,
        startDate,
        endDate,
        status: "PENDING_REVIEW",
      },
    });
  });
}
