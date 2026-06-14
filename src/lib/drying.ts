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

function parseHolidayDates(holidayJson: string | null | undefined): Set<string> {
  if (!holidayJson) return new Set();
  try {
    const v = JSON.parse(holidayJson) as unknown;
    if (!Array.isArray(v)) return new Set();
    return new Set(v.filter((x): x is string => typeof x === "string"));
  } catch {
    return new Set();
  }
}

export async function validateReservationRange(
  listingId: string,
  start: Date,
  end: Date,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const listing = await prisma.dryingFieldListing.findUnique({
    where: { id: listingId },
    include: { bookingRules: true },
  });
  if (!listing) return { ok: false, message: "晒场不存在" };

  const today = startOfDay(new Date());
  const startDay = startOfDay(start);
  const endDay = startOfDay(end);
  if (startDay < today) {
    return { ok: false, message: "开始日期不能早于今天" };
  }

  const rule = listing.bookingRules[0];
  const maxAdvance = rule?.maxAdvanceDays ?? 7;
  const latest = addDays(today, maxAdvance);
  if (startDay > latest || endDay > latest) {
    return { ok: false, message: `最多只能预约 ${maxAdvance} 天内的日期` };
  }

  const holidays = parseHolidayDates(rule?.holidayJson);
  const days = eachDayOfInterval({ start: startDay, end: endDay });
  for (const day of days) {
    const dayStr = format(day, "yyyy-MM-dd");
    if (holidays.has(dayStr)) {
      return { ok: false, message: `${dayStr} 为休息日，不可预约` };
    }
    const { available } = await getCapacityForDay(listingId, day);
    if (available <= 0) {
      return { ok: false, message: `${dayStr} 已满` };
    }
  }
  return { ok: true };
}
