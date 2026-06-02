import { NextResponse } from "next/server";
import { writeFile, mkdir } from "fs/promises";
import { join } from "path";
import { getCurrentAdmin } from "@/lib/auth/session";

const UPLOAD_DIR = join(process.cwd(), "data", "uploads");

export async function POST(req: Request) {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: "未登录" }, { status: 401 });

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "请使用 multipart/form-data 上传文件" }, { status: 400 });
  }
  const file = formData.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "缺少文件" }, { status: 400 });
  
  const allowedTypes = ["image/jpeg", "image/png", "image/webp", "image/gif"];
  if (!allowedTypes.includes(file.type)) {
    return NextResponse.json({ error: "仅支持 JPG/PNG/WebP/GIF 格式" }, { status: 400 });
  }
  if (file.size > 5 * 1024 * 1024) {
    return NextResponse.json({ error: "文件大小不能超过 5MB" }, { status: 400 });
  }
  
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "jpg";
  const fileName = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
  await mkdir(UPLOAD_DIR, { recursive: true });
  
  const bytes = await file.arrayBuffer();
  await writeFile(join(UPLOAD_DIR, fileName), Buffer.from(bytes));
  
  return NextResponse.json({ ok: true, url: `/api/uploads/${fileName}` });
}
