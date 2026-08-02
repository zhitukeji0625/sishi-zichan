import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { startOfDay, eachDayOfInterval, format } from "date-fns";

type Tx = Prisma.TransactionClient;

function safeEachDayOfInterval(start: Date, end: Date): Date[] {
  const s = startOfDay(start);
  const e = startOfDay(end);
  if (e < s) return [];
  return eachDayOfInterval({ start: s, end: e });
}

async function getCapacityForDayWithClient(
  listingId: string,
  day: Date,
  client: Tx | typeof prisma = prisma,
) {
  const d = startOfDay(day);
  const rule = await client.dryingCapacityRule.findFirst({
    where: {
      listingId,
      startDate: { lte: d },
      endDate: { gte: d },
    },
  });
  const max = rule?.maxPeople ?? 10;
  const reservations = await client.dryingReservation.findMany({
    where: {
      listingId,
      status: { notIn: ["REJECTED", "CANCELLED"] },
    },
  });
  let booked = 0;
  for (const r of reservations) {
    const days = safeEachDayOfInterval(r.startDate, r.endDate);
    if (days.some((x) => format(x, "yyyy-MM-dd") === format(d, "yyyy-MM-dd"))) {
      booked += 1;
    }
  }
  return { max, booked, available: Math.max(0, max - booked) };
}

export async function getCapacityForDay(listingId: string, day: Date) {
  return getCapacityForDayWithClient(listingId, day);
}

export async function validateReservationRange(
  listingId: string,
  start: Date,
  end: Date,
  client: Tx | typeof prisma = prisma,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const days = safeEachDayOfInterval(start, end);
  if (days.length === 0) {
    return { ok: false, message: "日期范围无效" };
  }
  for (const day of days) {
    const { available } = await getCapacityForDayWithClient(listingId, day, client);
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
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM DryingFieldListing WHERE id = ${params.listingId} FOR UPDATE`;
    const listing = await tx.dryingFieldListing.findUnique({ where: { id: params.listingId } });
    if (!listing || listing.status !== "OPERATING") {
      throw new Error("晒场不存在或未运营");
    }
    const check = await validateReservationRange(
      params.listingId,
      params.startDate,
      params.endDate,
      tx,
    );
    if (!check.ok) {
      throw new Error(check.message);
    }
    return tx.dryingReservation.create({
      data: {
        listingId: params.listingId,
        endUserId: params.endUserId,
        startDate: params.startDate,
        endDate: params.endDate,
        status: "PENDING_REVIEW",
      },
    });
  });
}
