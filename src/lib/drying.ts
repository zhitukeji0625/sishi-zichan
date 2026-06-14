import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { startOfDay, eachDayOfInterval, format } from "date-fns";

type Db = Prisma.TransactionClient | typeof prisma;

/** 将 yyyy-MM-dd 解析为本地时区午夜，避免 UTC 偏移导致日期错位 */
export function parseLocalDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export async function getCapacityForDay(db: Db, listingId: string, day: Date) {
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
  db: Db,
  listingId: string,
  start: Date,
  end: Date,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const days = eachDayOfInterval({ start: startOfDay(start), end: startOfDay(end) });
  for (const day of days) {
    const { available } = await getCapacityForDay(db, listingId, day);
    if (available <= 0) {
      return { ok: false, message: `${format(day, "yyyy-MM-dd")} 已满` };
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
    const check = await validateReservationRange(tx, listingId, start, end);
    if (!check.ok) {
      throw new Error(check.message);
    }
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
