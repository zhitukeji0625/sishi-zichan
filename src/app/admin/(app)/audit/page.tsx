import { prisma } from "@/lib/prisma";
import { getCurrentAdmin } from "@/lib/auth/session";
import { isDivision } from "@/lib/rbac";

export default async function AdminAuditPage() {
  const admin = await getCurrentAdmin();
  if (!admin) return null;
  if (!isDivision(admin.role)) {
    return (
      <div>
        <h1 className="text-xl font-semibold text-slate-900">操作日志</h1>
        <p className="mt-2 text-sm text-slate-500">仅师级管理员可查看操作日志。</p>
      </div>
    );
  }
  const logs = await prisma.auditLog.findMany({
    include: { adminUser: { select: { name: true, phone: true, role: true } } },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  return (
    <div>
      <h1 className="text-xl font-semibold text-slate-900">操作日志</h1>
      <p className="mt-1 text-sm text-slate-500">记录所有管理员操作，仅师级管理员可查看。</p>
      <div className="mt-6 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-100 bg-slate-50 text-slate-600">
            <tr>
              <th className="px-4 py-3 font-medium">时间</th>
              <th className="px-4 py-3 font-medium">操作人</th>
              <th className="px-4 py-3 font-medium">操作类型</th>
              <th className="px-4 py-3 font-medium">详情</th>
              <th className="px-4 py-3 font-medium">IP</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((log) => (
              <tr key={log.id} className="border-b border-slate-50 last:border-0">
                <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">
                  {log.createdAt.toISOString().slice(0, 19).replace("T", " ")}
                </td>
                <td className="px-4 py-3 text-slate-700">
                  {log.adminUser?.name ?? "—"}
                </td>
                <td className="px-4 py-3 text-slate-600">{log.action}</td>
                <td className="px-4 py-3 text-xs text-slate-500 max-w-xs truncate">
                  {log.detail ?? "—"}
                </td>
                <td className="px-4 py-3 text-xs text-slate-400">{log.ip ?? "—"}</td>
              </tr>
            ))}
            {logs.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-slate-500">暂无日志</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
