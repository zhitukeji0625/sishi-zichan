"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getCurrentAdmin } from "@/lib/auth/session";
import { isDivision } from "@/lib/rbac";
import { writeAudit } from "@/lib/audit";

export async function updateConfigAction(formData: FormData) {
  const admin = await getCurrentAdmin();
  if (!admin || !isDivision(admin.role)) return { error: "仅师级管理员可操作" };
  const entries = Array.from(formData.entries());
  for (const [key, value] of entries) {
    if (key.startsWith("config_")) {
      const configKey = key.replace("config_", "");
      await prisma.systemConfig.upsert({
        where: { key: configKey },
        create: { key: configKey, value: String(value) },
        update: { value: String(value) },
      });
    }
  }
  await writeAudit(admin.id, "CONFIG_UPDATE", JSON.stringify(Object.fromEntries(entries)));
  revalidatePath("/admin/config");
  return { ok: true as const };
}
