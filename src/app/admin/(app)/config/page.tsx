import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentAdmin } from "@/lib/auth/session";
import { isDivision } from "@/lib/rbac";
import { updateConfigAction } from "./actions";

const CONFIG_FIELDS = [
  { key: "site_name", label: "系统名称", type: "text" },
  { key: "service_phone", label: "客服电话", type: "text" },
  { key: "auction_rules", label: "竞拍规则说明", type: "textarea" },
  { key: "payment_timeout_hours", label: "支付超时（小时）", type: "number" },
  { key: "order_retention_days", label: "订单保留时长（天）", type: "number" },
];

export default async function AdminConfigPage() {
  const admin = await getCurrentAdmin();
  if (!admin) return null;
  if (!isDivision(admin.role)) {
    return (
      <div>
        <h1 className="text-xl font-semibold text-slate-900">系统配置</h1>
        <p className="mt-2 text-sm text-slate-500">仅师级管理员可修改系统配置。</p>
      </div>
    );
  }
  const configs = await prisma.systemConfig.findMany();
  const configMap = new Map(configs.map((c) => [c.key, c.value]));

  async function save(fd: FormData) {
    "use server";
    const r = await updateConfigAction(fd);
    if (r.error) redirect(`/admin/config?error=${encodeURIComponent(r.error)}`);
    redirect("/admin/config");
  }

  return (
    <div>
      <h1 className="text-xl font-semibold text-slate-900">系统配置</h1>
      <p className="mt-1 text-sm text-slate-500">配置系统基础运行参数。</p>
      <form action={save} className="mt-6 space-y-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        {CONFIG_FIELDS.map((field) => (
          <div key={field.key}>
            <label className="mb-1 block text-sm font-medium text-slate-700">{field.label}</label>
            {field.type === "textarea" ? (
              <textarea
                name={`config_${field.key}`}
                rows={3}
                defaultValue={configMap.get(field.key) ?? ""}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              />
            ) : (
              <input
                name={`config_${field.key}`}
                type={field.type}
                defaultValue={configMap.get(field.key) ?? ""}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              />
            )}
          </div>
        ))}
        <button type="submit" className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-medium text-white hover:bg-blue-800">
          保存配置
        </button>
      </form>
    </div>
  );
}
