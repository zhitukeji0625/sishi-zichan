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

/** 校验预约日期是否在允许预订窗口内（与前端 ReserveForm 规则一致） */
export async function validateBookingWindow(
  listingId: string,
  start: Date,
  end: Date,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const rule = await prisma.dryingBookingRule.findFirst({ where: { listingId } });
  const maxAdvance = rule?.maxAdvanceDays ?? 7;
  const today = startOfDay(new Date());
  const horizon = addDays(today, maxAdvance);
  const startDay = startOfDay(start);
  const endDay = startOfDay(end);
  if (startDay < today) {
    return { ok: false, message: "不能预约过去的日期" };
  }
  if (startDay > horizon || endDay > horizon) {
    return { ok: false, message: `最多可提前 ${maxAdvance} 天预约` };
  }
  return { ok: true };
}
