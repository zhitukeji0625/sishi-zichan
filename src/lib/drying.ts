import { prisma } from "@/lib/prisma";
import { startOfDay, eachDayOfInterval, format } from "date-fns";

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

function dateRangesOverlap(
  aStart: Date,
  aEnd: Date,
  bStart: Date,
  bEnd: Date,
): boolean {
  const s1 = startOfDay(aStart).getTime();
  const e1 = startOfDay(aEnd).getTime();
  const s2 = startOfDay(bStart).getTime();
  const e2 = startOfDay(bEnd).getTime();
  return s1 <= e2 && s2 <= e1;
}

export async function validateUserReservationOverlap(
  listingId: string,
  endUserId: string,
  start: Date,
  end: Date,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const existing = await prisma.dryingReservation.findMany({
    where: {
      listingId,
      endUserId,
      status: { notIn: ["REJECTED", "CANCELLED"] },
    },
  });
  for (const r of existing) {
    if (dateRangesOverlap(start, end, r.startDate, r.endDate)) {
      return { ok: false, message: "您在该时段已有重叠预约，请勿重复提交" };
    }
  }
  return { ok: true };
}
