export default function MobileLoading() {
  return (
    <div className="animate-pulse px-4 pt-6 space-y-4">
      <div className="h-6 w-40 rounded bg-slate-200" />
      <div className="h-32 rounded-2xl bg-slate-100" />
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-20 rounded-2xl bg-slate-100" />
        ))}
      </div>
    </div>
  );
}
