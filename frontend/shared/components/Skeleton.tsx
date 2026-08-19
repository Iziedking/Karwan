import { cn } from '@/shared/utils/cn';

/// Structural loading placeholder. SKILL.md forbids generic "Loading..." copy
/// and pulse-only blocks. A quiet surface reserves the final layout while a
/// one-pixel lime progress line communicates active work. Reduced-motion users
/// see the same stable geometry without the sweep.
export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn(
        'relative overflow-hidden rounded-[10px] bg-[var(--color-surface-2)]',
        className,
      )}
    >
      <span
        className="skeleton-sweep motion-reduce:hidden absolute inset-x-0 bottom-0 h-px w-1/3 bg-[var(--accent)]"
      />
    </div>
  );
}

/// A few stacked skeleton lines, for text-block loading states.
export function SkeletonText({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <div className={cn('space-y-2', className)}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          className={cn('h-3', i === lines - 1 ? 'w-2/3' : 'w-full')}
        />
      ))}
    </div>
  );
}
