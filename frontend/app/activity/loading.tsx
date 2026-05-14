export default function ActivityLoading() {
  return (
    <div className="space-y-8 max-w-5xl fade-up">
      <div className="flex items-end justify-between gap-4 pb-3 border-b border-[var(--color-line)]">
        <div className="space-y-2">
          <Shimmer className="h-3 w-16" />
          <Shimmer className="h-10 w-40" />
          <Shimmer className="h-3 w-72" />
        </div>
        <Shimmer className="h-4 w-12" />
      </div>

      <div className="space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-4 rounded-xl border border-[var(--color-line)] bg-[var(--color-surface)] overflow-hidden">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className={`px-5 py-4 space-y-2.5 ${i < 3 ? 'md:border-r border-[var(--color-line)]' : ''} ${
                i < 2 ? 'border-b md:border-b-0 border-[var(--color-line)]' : ''
              }`}
            >
              <Shimmer className="h-3 w-20" />
              <Shimmer className="h-8 w-10" />
              <Shimmer className="h-2.5 w-14" />
            </div>
          ))}
        </div>

        <div className="flex items-center gap-3">
          <Shimmer className="h-7 w-44 rounded-full" />
          <Shimmer className="h-7 w-56 rounded-full" />
        </div>

        <div className="rounded-xl border border-[var(--color-line)] bg-[var(--color-surface)]">
          <div className="px-5 py-4 border-b border-[var(--color-line)]">
            <Shimmer className="h-4 w-28" />
          </div>
          <div className="px-5 py-4 space-y-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-start gap-3">
                <Shimmer className="h-2 w-2 rounded-full mt-1" />
                <div className="flex-1 space-y-1.5">
                  <Shimmer className="h-3 w-48" />
                  <Shimmer className="h-2.5 w-24" />
                </div>
              </div>
            ))}
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
