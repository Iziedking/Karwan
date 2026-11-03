import { Icon, type IconName } from '@/shared/components/Icon';
import { useLocale } from '@/shared/i18n/LocaleProvider';
import { cn } from '@/shared/utils/cn';
import type { DealState } from './dealsList';

/// Each state's mark and colours. No green: green is only the screen's main
/// button (view 48). Your move is the one filled pill, so it reads first.
const LOOK: Record<DealState, { icon: IconName | null; className: string }> = {
  yourMove: { icon: null, className: 'bg-[var(--ink)] text-[var(--canvas)]' },
  active: { icon: null, className: 'border border-[var(--line-strong)] text-[var(--ink)]' },
  disputed: { icon: 'alert', className: 'border border-[var(--line-strong)] text-[var(--ink)]' },
  paidOut: { icon: 'check', className: 'bg-[var(--ash)] text-[var(--ink)]' },
  cancelled: { icon: 'close', className: 'bg-[var(--raised)] text-[var(--ink-muted)]' },
  refunding: { icon: 'return', className: 'bg-[var(--raised)] text-[var(--ink-secondary)]' },
  refunded: { icon: 'return', className: 'bg-[var(--raised)] text-[var(--ink-secondary)]' },
  split: { icon: 'arrow-left-right', className: 'bg-[var(--raised)] text-[var(--ink-secondary)]' },
  ended: { icon: 'check', className: 'bg-[var(--raised)] text-[var(--ink-secondary)]' },
};

export function DealStatePill({ state }: { state: DealState }) {
  const { t } = useLocale();
  const look = LOOK[state];
  return (
    <span data-deal-state={state} className={cn('inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full px-2.5 text-[13px] font-semibold', look.className)}>
      {look.icon ? <Icon name={look.icon} size={16} className="size-3" /> : <span aria-hidden className="size-1.5 rounded-full bg-current" />}
      {t.dealsPage.state[state]}
    </span>
  );
}
