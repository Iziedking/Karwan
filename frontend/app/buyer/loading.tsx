export default function BuyerLoading() {
  return (
    <div className="space-y-8 fade-up">
      <div className="flex items-end justify-between gap-3">
        <div className="space-y-2">
          <Shimmer className="h-7 w-32" />
          <Shimmer className="h-3 w-48" />
        </div>
        <Shimmer className="h-6 w-36 rounded-md" />
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        <div className="md:col-span-2 rounded-xl border border-[var(--color-line)] bg-[var(--color-surface)] p-5 space-y-4">
          <Shimmer className="h-4 w-24" />
          <Shimmer className="h-3 w-full" />
          <Shimmer className="h-24 w-full" />
          <div className="grid grid-cols-2 gap-3">
            <Shimmer className="h-10 w-full" />
            <Shimmer className="h-10 w-full" />
          </div>
          <Shimmer className="h-9 w-32 rounded-md" />
        </div>
        <div className="rounded-xl border border-[var(--color-line)] bg-[var(--color-surface)] p-5 space-y-3">
          <Shimmer className="h-3 w-20" />
          <Shimmer className="h-7 w-32" />
          <Shimmer className="h-3 w-24" />
        </div>
      </div>

      <div className="rounded-xl border border-[var(--color-line)] bg-[var(--color-surface)] p-5 space-y-3">
        <Shimmer className="h-4 w-28" />
        <Shimmer className="h-3 w-full" />
        <Shimmer className="h-3 w-full" />
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
