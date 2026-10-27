'use client';
import { useTranslations } from '@/shared/i18n/LocaleProvider';

/// Said once, after a person's own transaction also set up their Karwan record
/// (view 27, decision 10). Never asked before.
export function RecordDoneLine({ show }: { show: boolean }) {
  const t = useTranslations().recordOnTheWay;
  if (!show) return null;
  return (
    <p role="status" className="text-[14px] leading-snug text-[var(--lp-text-sub)]">
      {t.done}
    </p>
  );
}
