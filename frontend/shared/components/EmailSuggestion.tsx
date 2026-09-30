'use client';

import { useTranslations } from '@/shared/i18n/LocaleProvider';
import { suggestEmail } from '@/shared/utils/emailTypo';

/// "Did you mean ada@gmail.com?" under an email box. Tapping the address
/// applies it. Renders nothing when the address looks right.
export function EmailSuggestion({ email, onApply, className = '' }: { email: string; onApply: (next: string) => void; className?: string }) {
  const t = useTranslations();
  const suggestion = suggestEmail(email);
  if (!suggestion) return null;
  const [before = '', after = ''] = t.common.emailSuggestion.split('{email}');
  return (
    <p className={`text-[14px] text-[var(--ink-secondary)] ${className}`} aria-live="polite">
      {before}
      <button type="button" onClick={() => onApply(suggestion)}
        className="break-all font-medium text-[var(--ink)] underline underline-offset-2 hover:no-underline focus-visible:rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--action)]">
        {suggestion}
      </button>
      {after}
    </p>
  );
}
