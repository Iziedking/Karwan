'use client';
import { useTranslations } from '@/shared/i18n/LocaleProvider';

export function CopyButton({ text }: { text: string }) {
  const t = useTranslations().inlineControls;
  return (
    <button
      type="button"
      className="ms-2 text-[10px] text-[var(--color-ink-faint)] hover:text-[var(--color-ink)] transition-colors"
      onClick={() => navigator.clipboard?.writeText(text).catch(() => {})}
      title={t.copyTooltip}
    >
      {t.copyLabel}
    </button>
  );
}
