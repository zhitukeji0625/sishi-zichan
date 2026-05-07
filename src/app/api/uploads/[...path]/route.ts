import { NextResponse } from "next/server";
import { readFile, stat } from "fs/promises";
import { join } from "path";

const UPLOAD_DIR = join(process.cwd(), "data", "uploads");

const MIME_TYPES: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
};

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path } = await params;
  const fileName = path.join("/");
  
  if (fileName.includes("..") || fileName.includes("~")) {
    return NextResponse.json({ error: "非法路径" }, { status: 400 });
  }
  
  const filePath = join(UPLOAD_DIR, fileName);
  
  try {
    await stat(filePath);
  } catch {
    return NextResponse.json({ error: "文件不存在" }, { status: 404 });
  }
  
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
  const contentType = MIME_TYPES[ext] ?? "application/octet-stream";
  
  const data = await readFile(filePath);
  return new NextResponse(data, {
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
