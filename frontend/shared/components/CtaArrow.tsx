import { cn } from '@/shared/utils/cn';

/** An inline directional cue. The parent control owns its surface and contrast. */
export function CtaArrow({ className, tone = 'light' }: { className?: string; tone?: 'light' | 'dark' }) {
  return (
    <svg aria-hidden viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className={cn('shrink-0 rtl-flip', tone === 'dark' && 'text-white', className)}>
      <path d="M5 12h14m-6-6 6 6-6 6" />
    </svg>
  );
}

export function withoutTrailingArrow(label: string): string {
  return label.replace(/[\s ]*[→←↗↘⟶]\s*$/u, '');
}
