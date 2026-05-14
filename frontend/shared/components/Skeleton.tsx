import { cn } from '@/shared/utils/cn';

/// A structural loading placeholder. Pulses opacity only (GPU-friendly) and
/// goes still under prefers-reduced-motion. Pass sizing via className.
export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn(
        'animate-pulse motion-reduce:animate-none rounded-md bg-[var(--color-surface-2)]',
        className,
      )}
    />
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
