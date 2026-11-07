'use client';

import type { AssistantPickUp } from '@/core/api';
import { useTranslations } from '@/shared/i18n/LocaleProvider';
import { Icon } from '@/shared/components/Icon';

/// What was left unfinished, above the input after a break (view 66): one
/// line, Continue to open that conversation, and a way to put it away.
export function PickUpLine({ pickUp, onContinue, onDismiss, busy }: {
  pickUp: AssistantPickUp;
  onContinue: () => void;
  onDismiss: () => void;
  busy: boolean;
}) {
  const t = useTranslations().assistantMode;
  const held = Object.values(pickUp.held).some((n) => n > 0);
  const lead = pickUp.card
    ? t.pickUpCard.replace('{card}', pickUp.card)
    : pickUp.question
      ? t.pickUpQuestion.replace('{question}', pickUp.question)
      : null;
  const line = [lead, held ? t.pickUpHeld : null].filter(Boolean).join(' ');
  return (
    <section aria-label={t.pickUpLabel} className="mb-3 flex items-center gap-2 rounded-[16px] border border-[var(--line)] bg-[var(--surface)] py-2 ps-4 pe-2">
      <p className="min-w-0 flex-1 text-[14px] leading-snug text-[var(--ink)]">
        {line}
        {pickUp.source ? <span className="ms-1 text-[var(--ink-secondary)]">({pickUp.source === 'telegram' ? 'Telegram' : 'WhatsApp'})</span> : null}
      </p>
      <button
        type="button"
        onClick={onContinue}
        disabled={busy}
        className="inline-flex min-h-11 shrink-0 items-center rounded-full bg-[var(--ink)] px-4 text-[14px] font-semibold text-[var(--surface)] disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ink)] focus-visible:ring-offset-2"
      >
        {t.pickUpContinue}
      </button>
      <button
        type="button"
        onClick={onDismiss}
        aria-label={t.pickUpDismiss}
        className="grid size-11 shrink-0 place-items-center rounded-full text-[var(--ink-secondary)] hover:bg-[var(--raised)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ink)]"
      >
        <Icon name="close" size={20} />
      </button>
    </section>
  );
}
