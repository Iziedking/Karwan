'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { MoneyOutDestination } from '@/core/api';
import { useLocale, useTranslations } from '@/shared/i18n/LocaleProvider';
import { PRIMARY } from '@/shared/ui/controls';
import { formatWhen, nextStepFor, refusalLine, type MoneyOutRefusal } from './refusal';
import { useWorldAccountCheck } from './useWorldAccountCheck';

/// What a payment screen shows when the guard kept the money in: the reason in
/// one sentence, and the one thing the person can do about it. A new address
/// is added right here with World ID, for the exact address and network the
/// payment named.
export function MoneyOutNotice({
  refusal,
  destination,
  onCleared,
}: {
  refusal: MoneyOutRefusal;
  destination?: MoneyOutDestination;
  /// The check passed and the payment can be tried again.
  onCleared?: () => void;
}) {
  const copy = useTranslations().moneyOut;
  const { locale } = useLocale();
  const [outcome, setOutcome] = useState<string | null>(null);
  const check = useWorldAccountCheck((result) => {
    if (result.address) {
      setOutcome(copy.added.replace('{time}', formatWhen(result.address.opensAt, locale)));
      return;
    }
    setOutcome(copy.cleared);
    onCleared?.();
  });
  const step = nextStepFor(refusal);
  const busy = check.phase !== 'idle';

  if (outcome) {
    return (
      <p role="status" className="border-s-2 border-[var(--color-positive)] ps-3 text-[15px] leading-relaxed text-[var(--lp-dark)]">
        {outcome}
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <p role="alert" className="border-s-2 border-[var(--color-warning)] ps-3 text-[15px] leading-relaxed text-[var(--lp-dark)]">
        {refusalLine(refusal, copy, locale)}
      </p>
      {step.kind === 'link' ? (
        <Link href={step.href} className={PRIMARY}>
          {copy.linkWorldId}
        </Link>
      ) : step.kind === 'check' && (step.purpose !== 'add_address' || destination) ? (
        <button
          type="button"
          onClick={() => void check.begin(step.purpose, step.purpose === 'add_address' ? destination : undefined)}
          disabled={busy}
          aria-busy={busy}
          className={PRIMARY}
        >
          {busy ? copy.opening : step.purpose === 'add_address' ? copy.addAddress : step.purpose === 'unpause' ? copy.resume : copy.confirmItsYou}
        </button>
      ) : null}
      {check.error ? (
        <p role="alert" className="text-[14px] text-[var(--lp-dark)]">
          {check.error}
        </p>
      ) : null}
      {check.widget}
    </div>
  );
}
