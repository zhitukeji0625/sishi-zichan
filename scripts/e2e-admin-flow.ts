/**
 * Admin + full drying payment/contract flow test.
 */
import { PrismaClient } from "@prisma/client";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const prisma = new PrismaClient();
let failures = 0;

function ok(n: string) {
  console.log(`OK: ${n}`);
}
function fail(n: string, d: string) {
  console.log(`FAIL: ${n} — ${d}`);
  failures++;
}

function mergeCookies(existing: string, setCookie?: string | null): string {
  const jar = new Map<string, string>();
  for (const part of existing.split(";").map((s) => s.trim()).filter(Boolean)) {
    const [k, ...v] = part.split("=");
    if (k) jar.set(k, v.join("="));
  }
  if (setCookie) {
    const first = setCookie.split(";")[0];
    const [k, ...v] = first.split("=");
    if (k) jar.set(k.trim(), v.join("="));
  }
  return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
}

async function main() {
  let userCookies = "";
  let companyCookies = "";

  const userLogin = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone: "13800138000", password: "user123" }),
  });
  userCookies = mergeCookies("", userLogin.headers.get("set-cookie"));

  const adminLogin = await fetch(`${BASE}/api/auth/admin/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone: "13900000003", password: "admin123" }),
  });
  companyCookies = mergeCookies("", adminLogin.headers.get("set-cookie"));

  if (!userLogin.ok || !adminLogin.ok) {
    fail("login", "user or company admin login failed");
    process.exit(1);
  }
  ok("logins");

  const listing = await prisma.dryingFieldListing.findFirst({
    where: { status: "OPERATING" },
    include: { asset: true },
  });
  if (!listing) {
    fail("setup", "no drying listing");
    process.exit(1);
  }

  const reserve = await fetch(`${BASE}/api/m/drying/reserve`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: userCookies },
    body: JSON.stringify({
      listingId: listing.id,
      startDate: "2026-08-01",
      endDate: "2026-08-02",
    }),
  });
  const reserveBody = await reserve.json();
  if (!reserve.ok || !reserveBody.id) {
    fail("reserve", JSON.stringify(reserveBody));
    process.exit(1);
  }
  ok("create reservation");
  const resId = reserveBody.id as string;

  await prisma.dryingReservation.update({
    where: { id: resId },
    data: { status: "APPROVED" },
  });
  ok("simulate company approval (DB)");

  const deposit = await fetch(`${BASE}/api/m/payments/mock`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: userCookies },
    body: JSON.stringify({ purpose: "DRYING_DEPOSIT", reservationId: resId }),
  });
  const depositBody = await deposit.json();
  if (deposit.ok && depositBody.ok) ok("drying deposit payment");
  else fail("drying deposit", JSON.stringify(depositBody));

  const resAfter = await prisma.dryingReservation.findUnique({ where: { id: resId } });
  if (resAfter?.status === "CONTRACT_PENDING") ok("reservation -> CONTRACT_PENDING");
  else fail("status after deposit", resAfter?.status ?? "null");

  // Contract page
  const contractPage = await fetch(`${BASE}/m/contract/${resId}`, {
    headers: { Cookie: userCookies },
  });
  if (contractPage.ok) ok("GET /m/contract/[id]");
  else fail("contract page", String(contractPage.status));

  // Admin asset create via API
  const org = await prisma.organization.findFirst({ where: { code: "CO101" } });
  if (org) {
    const fd = new FormData();
    fd.set("orgId", org.id);
    fd.set("type", "LAND");
    fd.set("name", "E2E测试地块");
    fd.set("locationText", "测试位置");
    fd.set("status", "IDLE");
    const create = await fetch(`${BASE}/api/admin/assets`, {
      method: "POST",
      headers: { Cookie: companyCookies },
      body: fd,
    });
    const createBody = await create.json();
    if (create.ok && createBody.ok) ok("admin create asset");
    else fail("admin create asset", JSON.stringify(createBody));
    await prisma.asset.deleteMany({ where: { name: "E2E测试地块" } });
  }

  // Upload tiny PNG
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    "base64",
  );
  const uploadFd = new FormData();
  uploadFd.set("file", new Blob([png], { type: "image/png" }), "test.png");
  const upload = await fetch(`${BASE}/api/upload`, {
    method: "POST",
    headers: { Cookie: companyCookies },
    body: uploadFd,
  });
  const uploadBody = await upload.json();
  if (upload.ok && uploadBody.url) ok("image upload");
  else fail("image upload", JSON.stringify(uploadBody));

  // Cleanup reservation
  await prisma.payment.deleteMany({ where: { reservationId: resId } });
  await prisma.contract.deleteMany({ where: { reservationId: resId } });
  await prisma.dryingReservation.delete({ where: { id: resId } });

  console.log(failures === 0 ? "\nAll admin flow checks passed." : `\n${failures} failed.`);
  process.exit(failures > 0 ? 1 : 0);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
