import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentAdmin } from "@/lib/auth/session";
import { isDivision } from "@/lib/rbac";
import { AdminFlashError } from "@/components/AdminFlashError";
import {
  createDictCategoryAction,
  createDictItemAction,
  updateDictItemAction,
  deleteDictItemAction,
  deleteDictCategoryAction,
} from "./actions";

export default async function AdminDictPage({
  searchParams,
}: {
  searchParams: Promise<{ cat?: string; error?: string }>;
}) {
  const admin = await getCurrentAdmin();
  if (!admin) return null;
  const { cat: selectedCatId, error } = await searchParams;

  const categories = await prisma.dictCategory.findMany({
    orderBy: { code: "asc" },
    include: { _count: { select: { items: true } } },
  });

  const selectedCategory = selectedCatId
    ? await prisma.dictCategory.findUnique({
        where: { id: selectedCatId },
        include: { items: { orderBy: { sortOrder: "asc" } } },
      })
    : null;

  async function createCategory(fd: FormData) {
    "use server";
    const r = await createDictCategoryAction(fd);
    if (r.error) redirect(`/admin/dict?error=${encodeURIComponent(r.error)}`);
    redirect("/admin/dict");
  }

  async function createItem(fd: FormData) {
    "use server";
    const catId = String(fd.get("categoryId") ?? "");
    const r = await createDictItemAction(fd);
    if (r.error) redirect(`/admin/dict?cat=${catId}&error=${encodeURIComponent(r.error)}`);
    redirect(`/admin/dict?cat=${catId}`);
  }

  return (
    <div>
      <h1 className="text-xl font-semibold text-slate-900">数据字典</h1>
      <p className="mt-1 text-sm text-slate-500">
        管理系统中所有下拉选项的可选值。修改后各表单下拉菜单实时生效。
      </p>
      <AdminFlashError error={error} />

      <div className="mt-6 grid gap-6 lg:grid-cols-[280px_1fr]">
        {/* Left: category list */}
        <div>
          {isDivision(admin.role) && (
            <form action={createCategory} className="mb-4 space-y-2 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="text-xs font-medium text-slate-700">新增字典分类</div>
              <input name="code" placeholder="代码（英文）" required className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
              <input name="name" placeholder="名称（中文）" required className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
              <input name="description" placeholder="描述（可选）" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
              <button type="submit" className="w-full rounded-lg bg-blue-700 py-2 text-xs font-medium text-white hover:bg-blue-800">
                新增分类
              </button>
            </form>
          )}
          <div className="space-y-1">
            {categories.map((c) => (
              <a
                key={c.id}
                href={`/admin/dict?cat=${c.id}`}
                className={`flex items-center justify-between rounded-lg px-3 py-2.5 text-sm transition-colors ${
                  selectedCatId === c.id
                    ? "bg-blue-50 font-medium text-blue-700"
                    : "text-slate-700 hover:bg-slate-100"
                }`}
              >
                <div>
                  <div className={selectedCatId === c.id ? "font-semibold" : ""}>{c.name}</div>
                  <div className="text-[10px] text-slate-400">{c.code}</div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-500">
                    {c._count.items}
                  </span>
                  {c.builtIn && (
                    <span className="rounded-full bg-amber-50 px-1.5 py-0.5 text-[10px] text-amber-600">内置</span>
                  )}
                </div>
              </a>
            ))}
          </div>
        </div>

        {/* Right: items for selected category */}
        <div>
          {!selectedCategory && (
            <div className="flex h-64 items-center justify-center rounded-xl border border-dashed border-slate-200 text-sm text-slate-400">
              ← 请选择一个字典分类
            </div>
          )}
          {selectedCategory && (
            <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-100 px-4 py-3">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-medium text-slate-900">{selectedCategory.name}</div>
                    <div className="text-xs text-slate-400">{selectedCategory.code} · {selectedCategory.description ?? "无描述"}</div>
                  </div>
                  {isDivision(admin.role) && !selectedCategory.builtIn && (
                    <form action={async (fd: FormData) => { "use server"; fd.append("id", selectedCategory.id); await deleteDictCategoryAction(fd); }} >
                      <input type="hidden" name="id" value={selectedCategory.id} />
                      <button type="submit" className="rounded-lg border border-red-200 px-3 py-1.5 text-xs text-red-600 hover:bg-red-50">
                        删除分类
                      </button>
                    </form>
                  )}
                </div>
              </div>

              {/* Items table */}
              <table className="w-full text-left text-sm">
                <thead className="border-b border-slate-100 bg-slate-50 text-slate-600">
                  <tr>
                    <th className="px-4 py-2.5 font-medium">值</th>
                    <th className="px-4 py-2.5 font-medium">显示名称</th>
                    <th className="px-4 py-2.5 font-medium">排序</th>
                    <th className="px-4 py-2.5 font-medium">状态</th>
                    {isDivision(admin.role) && <th className="px-4 py-2.5 font-medium">操作</th>}
                  </tr>
                </thead>
                <tbody>
                  {selectedCategory.items.map((item) => (
                    <tr key={item.id} className="border-b border-slate-50 last:border-0">
                      <td className="px-4 py-2.5 font-mono text-xs text-slate-500">{item.value}</td>
                      <td className="px-4 py-2.5 text-slate-800">{item.label}</td>
                      <td className="px-4 py-2.5 text-slate-500">{item.sortOrder}</td>
                      <td className="px-4 py-2.5">
                        {item.enabled ? (
                          <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700">启用</span>
                        ) : (
                          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-500">禁用</span>
                        )}
                      </td>
                      {isDivision(admin.role) && (
                        <td className="px-4 py-2.5">
                          <div className="flex gap-2">
                            <form action={async (fd: FormData) => { "use server"; await updateDictItemAction(fd); }}>
                              <input type="hidden" name="id" value={item.id} />
                              <input type="hidden" name="label" value={item.label} />
                              <input type="hidden" name="sortOrder" value={item.sortOrder} />
                              <input type="hidden" name="enabled" value={item.enabled ? "false" : "true"} />
                              <button type="submit" className="text-xs text-blue-700 hover:underline">
                                {item.enabled ? "禁用" : "启用"}
                              </button>
                            </form>
                            {!selectedCategory.builtIn && (
                              <form action={async (fd: FormData) => {
                                "use server";
                                const r = await deleteDictItemAction(fd);
                                if (r.error) redirect(`/admin/dict?cat=${selectedCategory.id}&error=${encodeURIComponent(r.error)}`);
                                redirect(`/admin/dict?cat=${selectedCategory.id}`);
                              }}>
                                <input type="hidden" name="id" value={item.id} />
                                <button type="submit" className="text-xs text-red-600 hover:underline">删除</button>
                              </form>
                            )}
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Add item form */}
              {isDivision(admin.role) && (
                <div className="border-t border-slate-100 p-4">
                  <div className="mb-2 text-xs font-medium text-slate-700">添加选项</div>
                  <form action={createItem} className="flex gap-2">
                    <input type="hidden" name="categoryId" value={selectedCategory.id} />
                    <input name="value" placeholder="值（英文/代码）" required className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm" />
                    <input name="label" placeholder="显示名称" required className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm" />
                    <input name="sortOrder" type="number" defaultValue={selectedCategory.items.length + 1} className="w-16 rounded-lg border border-slate-200 px-3 py-2 text-sm" />
                    <button type="submit" className="shrink-0 rounded-lg bg-blue-700 px-4 py-2 text-sm font-medium text-white hover:bg-blue-800">
                      添加
                    </button>
                  </form>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
