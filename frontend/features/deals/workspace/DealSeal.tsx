'use client';
import { Icon } from '@/shared/components/Icon';
import { useTranslations } from '@/shared/i18n/LocaleProvider';
import { cn } from '@/shared/utils/cn';

/// The mark beside the money line (view 92). It looks like the deals list's
/// state pill: Your turn is the one filled pill, Held is a quiet surface with a
/// lock. No green, which stays on the main button (view 48).
export function DealSeal({ tone }: { tone: 'turn' | 'held' }) {
  const t = useTranslations().dealPage.seal;
  return (
    <span
      data-deal-seal={tone}
      className={cn(
        'inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full px-2.5 text-[13px] font-semibold',
        tone === 'turn' ? 'bg-[var(--ink)] text-[var(--canvas)]' : 'bg-[var(--ash)] text-[var(--ink)]',
      )}
    >
      {tone === 'held' ? <Icon name="lock" size={16} className="size-3.5" /> : null}
      {tone === 'turn' ? t.yourTurn : t.held}
    </span>
  );
}
