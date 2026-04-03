export default function MobileLoading() {
  return (
    <div className="px-4 pt-6">
      <div className="gradient-header -mx-4 -mt-6 px-5 pb-12 pt-12">
        <div className="flex items-center gap-3">
          <div className="h-11 w-11 animate-pulse rounded-2xl bg-white/20" />
          <div className="space-y-2">
            <div className="h-5 w-28 animate-pulse rounded bg-white/20" />
            <div className="h-3 w-20 animate-pulse rounded bg-white/10" />
          </div>
        </div>
      </div>
      <div className="relative -mt-8 space-y-4">
        <div className="card-elevated-lg p-5">
          <div className="grid grid-cols-2 gap-3">
            <div className="h-24 animate-pulse rounded-2xl bg-slate-100" />
            <div className="h-24 animate-pulse rounded-2xl bg-slate-100" />
          </div>
        </div>
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="card-elevated h-16 animate-pulse" />
          ))}
        </div>
      </div>
    </div>
  );
}
