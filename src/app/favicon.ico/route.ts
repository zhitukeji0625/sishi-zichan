import { NextResponse } from "next/server";

/** Serve /favicon.ico by redirecting to the generated app icon. */
export async function GET(req: Request) {
  const url = new URL("/icon", req.url);
  return NextResponse.redirect(url, 307);
}
