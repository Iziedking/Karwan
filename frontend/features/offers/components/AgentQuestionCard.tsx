'use client';
import { useId, useState } from 'react';
import { api, type AgentQuestion } from '@/core/api';
import { Button } from '@/shared/components/Button';
import { useTranslations } from '@/shared/i18n/LocaleProvider';
import { fill, questionLine, questionShape } from '../agentQuestionCard';

/// The question a seller's agent asked them about this request (view 41): one
/// card, three answers. Offer sends the suggested offer through the same route
/// as any offer of their own, Change the price opens the offer sheet with the
/// suggestion filled in, Not for me closes it and the buyer's "checking" line.
export function AgentQuestionCard({
  question,
  onOffer,
  onChangePrice,
  onDone,
}: {
  question: AgentQuestion;
  /// Send the offer the agent suggested, at this price and in these days.
  onOffer: (priceUsdc: string, deliverInDays: number) => Promise<void>;
  /// Open the offer sheet with this price filled in.
  onChangePrice: (priceUsdc: string) => void;
  onDone: () => Promise<void>;
}) {
  const t = useTranslations().agentQuestions;
  const titleId = useId();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const shape = questionShape(question.kind);
  if (!shape) return null;
  const price = question.suggested.priceUsdc ?? '';
  const their = question.facts.theirPriceUsdc ?? '';

  async function run(step: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await step();
      await onDone();
    } catch {
      setError(t.failed);
    } finally {
      setBusy(false);
    }
  }
  const answer = (choice: 'yes' | 'change' | 'no', priceUsdc?: string) =>
    api.answerAgentQuestion(question.id, { choice, ...(priceUsdc ? { priceUsdc } : {}) });
  const offer = () =>
    run(async () => {
      const r = await answer('yes');
      if (r.next?.intent === 'make_offer') await onOffer(r.next.priceUsdc, r.next.deliverInDays);
    });

  return (
    <section aria-labelledby={titleId} className="border-t border-[var(--lp-border-light)] pt-6">
      <p id={titleId} className="text-[14px] font-medium text-[var(--lp-text-sub)]">
        {t.cardTitle}
      </p>
      <p className="mt-2 text-[18px] font-semibold leading-snug tabular-nums text-[var(--lp-dark)]">{questionLine(t, question)}</p>
      <div className="mt-5 flex flex-wrap gap-3">
        {shape === 'request' ? (
          <>
            <Button size="lg" className="rounded-full" loading={busy} onClick={() => void offer()}>
              {fill(t.offer, { price })}
            </Button>
            <Button size="lg" variant="outline" className="rounded-full" disabled={busy} onClick={() => onChangePrice(price)}>
              {t.changePrice}
            </Button>
          </>
        ) : (
          <>
            <Button
              size="lg"
              className="rounded-full"
              loading={busy}
              onClick={() =>
                void run(async () => {
                  await answer('yes');
                })
              }
            >
              {fill(t.take, { their })}
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="rounded-full"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  await answer('change', price);
                })
              }
            >
              {fill(t.hold, { price })}
            </Button>
          </>
        )}
        <Button
          size="lg"
          variant="ghost"
          className="rounded-full"
          disabled={busy}
          onClick={() =>
            void run(async () => {
              await answer('no');
            })
          }
        >
          {t.notForMe}
        </Button>
      </div>
      <p className="mt-3 text-[14px] font-medium text-[var(--lp-text-sub)]">{t.waiting}</p>
      {error ? (
        <p role="alert" className="mt-2 text-[14px] text-[var(--color-critical)]">
          {error}
        </p>
      ) : null}
    </section>
  );
}
