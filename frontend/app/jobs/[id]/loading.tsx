export default function JobLoading() {
  return (
    <div className="space-y-8 fade-up">
      <div className="space-y-2">
        <Shimmer className="h-3 w-20" />
        <Shimmer className="h-7 w-72" />
        <Shimmer className="h-3 w-96" />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="rounded-xl border border-[var(--color-line)] bg-[var(--color-surface)] p-4 space-y-3"
          >
            <Shimmer className="h-2.5 w-14" />
            <Shimmer className="h-5 w-24" />
          </div>
        ))}
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        <div className="md:col-span-2 space-y-6">
          <div className="rounded-xl border border-[var(--color-line)] bg-[var(--color-surface)] p-6">
            <Shimmer className="h-4 w-full" />
          </div>
          <div className="rounded-xl border border-[var(--color-line)] bg-[var(--color-surface)] p-6 space-y-4">
            <Shimmer className="h-3 w-16" />
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="space-y-2">
                <Shimmer className="h-3 w-56" />
                <Shimmer className="h-3 w-40" />
              </div>
            ))}
          </div>
        </div>
        <div className="space-y-4">
          <div className="rounded-xl border border-[var(--color-line)] bg-[var(--color-surface)] p-5 space-y-3">
            <Shimmer className="h-3 w-12" />
            <Shimmer className="h-6 w-32" />
            <Shimmer className="h-1 w-full rounded-full" />
          </div>
          <div className="rounded-xl border border-[var(--color-line)] bg-[var(--color-surface)] p-5 space-y-3">
            <Shimmer className="h-3 w-24" />
            <Shimmer className="h-7 w-40" />
          </div>
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
