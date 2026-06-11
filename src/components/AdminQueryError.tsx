"use client";

import { useSearchParams } from "next/navigation";

export function AdminQueryError() {
  const searchParams = useSearchParams();
  const error = searchParams.get("error");
  if (!error) return null;
  return (
    <div
      role="alert"
      className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
    >
      {error}
    </div>
  );
}
