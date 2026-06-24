import { Prisma } from "@prisma/client";

/** Map Prisma errors to user-facing messages for API/action handlers. */
export function prismaErrorMessage(e: unknown): string | null {
  if (e instanceof Prisma.PrismaClientKnownRequestError) {
    switch (e.code) {
      case "P2002":
        return "记录已存在";
      case "P2003":
        return "关联记录不存在";
      case "P2025":
        return "记录不存在";
      default:
        return null;
    }
  }
  return null;
}
