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

function rangesOverlap(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date) {
  return startOfDay(aStart) <= startOfDay(bEnd) && startOfDay(bStart) <= startOfDay(aEnd);
}

export async function validateReservationRange(
  listingId: string,
  start: Date,
  end: Date,
  endUserId?: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  if (endUserId) {
    const existing = await prisma.dryingReservation.findMany({
      where: {
        listingId,
        endUserId,
        status: { notIn: ["REJECTED", "CANCELLED"] },
      },
    });
    for (const r of existing) {
      if (rangesOverlap(start, end, r.startDate, r.endDate)) {
        return { ok: false, message: "您在该时段已有预约，请勿重复提交" };
      }
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
