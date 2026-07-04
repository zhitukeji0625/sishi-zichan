"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ImageUploader } from "@/components/ImageUploader";
interface Org {
  id: string;
  name: string;
  code: string;
}

interface Props {
  orgs: Org[];
  defaultOrgId: string;
  action: "create" | "edit";
  typeOptions: { value: string; label: string }[];
  statusOptions: { value: string; label: string }[];
  asset?: {
    id: string;
    name: string;
    type: string;
    locationText: string;
    specs: string | null;
    description: string | null;
    refPriceMin: string | null;
    refPriceMax: string | null;
    status: string;
    imagesJson: string | null;
    orgId: string;
  };
}

export function AssetForm({ orgs, defaultOrgId, action, typeOptions, statusOptions, asset }: Props) {
  const router = useRouter();
  const [images, setImages] = useState<string[]>(() => {
    if (asset?.imagesJson) {
      try {
        const parsed = JSON.parse(asset.imagesJson);
        return Array.isArray(parsed) ? parsed : [];
      } catch { return []; }
    }
    return [];
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const fd = new FormData(e.currentTarget);
    fd.set("imagesJson", JSON.stringify(images));
    
    const url = action === "create" ? "/api/admin/assets" : `/api/admin/assets/${asset?.id}`;
    const res = await fetch(url, { method: "POST", body: fd });
    const j = await res.json().catch(() => ({}));
    setSubmitting(false);
    if (!res.ok || j.error) {
      setError(j.error ?? "操作失败");
      return;
    }
    router.push("/admin/assets");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      {action === "create" && (
        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-700">所属组织</label>
          <select name="orgId" required className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm" defaultValue={defaultOrgId}>
            {orgs.map((o) => <option key={o.id} value={o.id}>{o.name}（{o.code}）</option>)}
          </select>
        </div>
      )}
      <div>
        <label className="mb-1.5 block text-sm font-medium text-slate-700">资产类型</label>
        <select name="type" className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm" defaultValue={asset?.type ?? "LAND"}>
          {typeOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>
      <div>
        <label className="mb-1.5 block text-sm font-medium text-slate-700">名称</label>
        <input name="name" required defaultValue={asset?.name ?? ""} className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm" />
      </div>
      <div>
        <label className="mb-1.5 block text-sm font-medium text-slate-700">位置</label>
        <input name="locationText" required defaultValue={asset?.locationText ?? ""} className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm" />
      </div>
      <div>
        <label className="mb-1.5 block text-sm font-medium text-slate-700">资产图片（最多 6 张）</label>
        <ImageUploader images={images} onChange={setImages} max={6} />
      </div>
      <div>
        <label className="mb-1.5 block text-sm font-medium text-slate-700">规格说明</label>
        <textarea name="specs" rows={2} defaultValue={asset?.specs ?? ""} className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm" />
      </div>
      <div>
        <label className="mb-1.5 block text-sm font-medium text-slate-700">详情描述</label>
        <textarea name="description" rows={4} defaultValue={asset?.description ?? ""} className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm" />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-700">参考价下限</label>
          <input name="refPriceMin" type="number" step="0.01" defaultValue={asset?.refPriceMin ?? ""} className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm" />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-700">参考价上限</label>
          <input name="refPriceMax" type="number" step="0.01" defaultValue={asset?.refPriceMax ?? ""} className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm" />
        </div>
      </div>
      <div>
        <label className="mb-1.5 block text-sm font-medium text-slate-700">状态</label>
        <select name="status" className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm" defaultValue={asset?.status ?? "IDLE"}>
          {statusOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>
      {error && <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">{error}</div>}
      <button type="submit" disabled={submitting} className="w-full rounded-lg bg-blue-700 py-2.5 text-sm font-medium text-white hover:bg-blue-800 disabled:opacity-50">
        {submitting ? "保存中…" : action === "create" ? "保存资产" : "更新资产"}
      </button>
    </form>
  );
}
