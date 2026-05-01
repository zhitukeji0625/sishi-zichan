export default function AdminLoading() {
  return (
    <div className="animate-pulse space-y-4">
      <div className="h-6 w-48 rounded bg-slate-200" />
      <div className="h-4 w-64 rounded bg-slate-100" />
      <div className="mt-6 space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-16 rounded-xl bg-slate-100" />
        ))}
      </div>
    </div>
  );
}
