import { prisma } from "@/lib/prisma";
import { startOfDay, eachDayOfInterval, format, addDays } from "date-fns";

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

export async function validateBookingDates(
  listingId: string,
  start: Date,
  end: Date,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const today = startOfDay(new Date());
  const startDay = startOfDay(start);
  const endDay = startOfDay(end);

  if (startDay < today) {
    return { ok: false, message: "开始日期不能早于今天" };
  }

  const rule = await prisma.dryingBookingRule.findFirst({
    where: { listingId },
  });
  const maxAdvanceDays = rule?.maxAdvanceDays ?? 7;
  const maxDate = addDays(today, maxAdvanceDays);
  if (startDay > maxDate || endDay > maxDate) {
    return { ok: false, message: `最多提前 ${maxAdvanceDays} 天预约` };
  }

  return { ok: true };
}
