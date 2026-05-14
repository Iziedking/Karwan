export default function SellerLoading() {
  return (
    <div className="space-y-8 fade-up">
      <div className="flex items-end justify-between gap-3">
        <div className="space-y-2">
          <Shimmer className="h-7 w-28" />
          <Shimmer className="h-3 w-44" />
        </div>
        <Shimmer className="h-7 w-40 rounded-md" />
      </div>

      <div className="rounded-xl border border-[var(--color-line)] bg-[var(--color-surface)] p-5 space-y-4">
        <Shimmer className="h-4 w-40" />
        <div className="grid md:grid-cols-3 gap-5">
          <Shimmer className="h-16 w-full" />
          <Shimmer className="h-16 w-full" />
          <Shimmer className="h-16 w-full" />
        </div>
      </div>

      <div className="rounded-xl border border-[var(--color-line)] bg-[var(--color-surface)] p-5 space-y-3">
        <Shimmer className="h-4 w-36" />
        <Shimmer className="h-3 w-full" />
        <Shimmer className="h-3 w-2/3" />
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        <div className="md:col-span-2 rounded-xl border border-[var(--color-line)] bg-[var(--color-surface)] p-5 space-y-3">
          <Shimmer className="h-4 w-24" />
          <Shimmer className="h-3 w-full" />
          <Shimmer className="h-3 w-full" />
        </div>
        <div className="rounded-xl border border-[var(--color-line)] bg-[var(--color-surface)] p-5 space-y-3">
          <Shimmer className="h-3 w-20" />
          <Shimmer className="h-7 w-32" />
          <Shimmer className="h-3 w-24" />
        </div>
      </div>
    </div>
  );
}

function Shimmer({ className = '' }: { className?: string }) {
  return (
    <span
      className={`block rounded bg-[var(--color-surface-2)] relative overflow-hidden ${className}`}
    >
      <span
        aria-hidden
        className="absolute inset-0 stat-sweep"
        style={{
          background:
            'linear-gradient(90deg, transparent 0%, color-mix(in srgb, var(--color-ink) 6%, transparent) 50%, transparent 100%)',
        }}
      />
    </span>
  );
}
