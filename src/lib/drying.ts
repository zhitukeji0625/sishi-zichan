import { prisma } from "@/lib/prisma";
import { startOfDay, eachDayOfInterval, format } from "date-fns";

function rangesOverlap(startA: Date, endA: Date, startB: Date, endB: Date) {
  const a0 = startOfDay(startA).getTime();
  const a1 = startOfDay(endA).getTime();
  const b0 = startOfDay(startB).getTime();
  const b1 = startOfDay(endB).getTime();
  return a0 <= b1 && b0 <= a1;
}

export async function validateUserReservationOverlap(
  endUserId: string,
  start: Date,
  end: Date,
  excludeReservationId?: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const existing = await prisma.dryingReservation.findMany({
    where: {
      endUserId,
      status: { notIn: ["REJECTED", "CANCELLED"] },
      ...(excludeReservationId ? { id: { not: excludeReservationId } } : {}),
    },
  });
  for (const r of existing) {
    if (rangesOverlap(start, end, r.startDate, r.endDate)) {
      return {
        ok: false,
        message: `与已有预约（${format(r.startDate, "yyyy-MM-dd")} 至 ${format(r.endDate, "yyyy-MM-dd")}）日期重叠`,
      };
    }
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
  const days = eachDayOfInterval({ start: startOfDay(start), end: startOfDay(end) });
  for (const day of days) {
    const { available } = await getCapacityForDay(listingId, day);
    if (available <= 0) {
      return { ok: false, message: `${format(day, "yyyy-MM-dd")} 已满` };
    }
  }
  return { ok: true };
}
