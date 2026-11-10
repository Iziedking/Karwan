'use client';
import { useEffect, useState } from 'react';
import { api, type ChoiceView, type SellerChoice } from '@/core/api';
import { Button } from '@/shared/components/Button';
import { CARD_CLASS } from '@/shared/components/Card';
import { useLocale } from '@/shared/i18n/LocaleProvider';
import { chosenCopy } from '@/shared/i18n/messages/chosen';
import { MoneyInput } from '@/features/money/components/MoneyInput';
import { PriceIn } from '@/features/money/components/Price';
import { answerByText } from '@/features/jobs/chosenPresentation';

/// A buyer chose this seller and waits for their answer (view 75): accept,
/// ask for more, or decline. Nothing is held until they accept.
export function ChosenCard({ jobId, me, title, choice, onDone }: {
  jobId: string;
  me: string;
  title: string | null;
  choice: Pick<ChoiceView, 'priceUsdc' | 'answerBy' | 'state' | 'raisedPriceUsdc'>;
  onDone: () => void;
}) {
  const { locale } = useLocale();
  const copy = chosenCopy[locale];
  const [busy, setBusy] = useState<'accept' | 'decline' | 'raise' | null>(null);
  const [asking, setAsking] = useState(false);
  const [sure, setSure] = useState(false);
  const [price, setPrice] = useState<number | ''>('');
  const [error, setError] = useState(false);

  async function run(kind: 'accept' | 'decline' | 'raise', call: () => Promise<unknown>) {
    setBusy(kind);
    setError(false);
    try {
      await call();
      onDone();
    } catch {
      setError(true);
    } finally {
      setBusy(null);
    }
  }

  const raised = choice.state === 'raised' && choice.raisedPriceUsdc;
  return (
    <div data-chosen-card className={`${CARD_CLASS} space-y-4 p-5`}>
      <div className="space-y-1">
        <h3 className="text-[17px] font-semibold text-[var(--ink)]">{copy.sellerTitle}</h3>
        <p dir="auto" className="text-[15px] text-[var(--ink-secondary)]">
          <PriceIn template={copy.sellerLine.replace('{title}', title ?? '')} usdc={Number(choice.priceUsdc)} />
        </p>
        <p className="text-[14px] text-[var(--ink-secondary)]">
          {raised ? <PriceIn template={copy.askedForMore} usdc={Number(choice.raisedPriceUsdc)} /> : `${copy.answerBy.replace('{date}', answerByText(choice.answerBy, locale))} ${copy.nothingHeld}`}
        </p>
      </div>
      {raised ? null : asking ? (
        <div className="space-y-3">
          <label className="block space-y-1.5">
            <span className="text-[14px] font-medium text-[var(--ink)]">{copy.yourPrice}</span>
            <MoneyInput value={price} disabled={busy !== null} onChange={(usdc) => setPrice(usdc ?? '')} />
          </label>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="primary"
              loading={busy === 'raise'}
              disabled={busy !== null || !(typeof price === 'number' && price > Number(choice.priceUsdc))}
              onClick={() => void run('raise', () => api.raiseChoice(jobId, me, Number(price)))}
            >
              {copy.sendPrice}
            </Button>
            <Button variant="secondary" disabled={busy !== null} onClick={() => setAsking(false)}>{copy.back}</Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button variant="primary" loading={busy === 'accept'} disabled={busy !== null} onClick={() => void run('accept', () => api.answerChoice(jobId, me, 'accept'))}>
            {copy.accept}
          </Button>
          <Button variant="secondary" disabled={busy !== null} onClick={() => { setSure(false); setAsking(true); }}>{copy.askForMore}</Button>
          <Button
            variant="secondary"
            loading={busy === 'decline'}
            disabled={busy !== null}
            onClick={() => (sure ? void run('decline', () => api.answerChoice(jobId, me, 'decline')) : setSure(true))}
          >
            {sure ? copy.declineSure : copy.decline}
          </Button>
        </div>
      )}
      {error ? <p role="alert" className="text-[14px] font-medium text-[var(--ink)]">{copy.sellerFailed}</p> : null}
    </div>
  );
}

/// Every choice waiting on this seller, for the seller's desk.
export function SellerChoices({ choices, me, onDone }: { choices: SellerChoice[]; me: string; onDone: () => void }) {
  if (choices.length === 0 || !me) return null;
  return (
    <section id="chosen" className="scroll-mt-20 space-y-3">
      {choices.map((c) => (
        <ChosenCard key={c.jobId} jobId={c.jobId} me={me} title={c.title} choice={{ priceUsdc: c.priceUsdc, answerBy: c.answerBy, state: 'waiting' }} onDone={onDone} />
      ))}
    </section>
  );
}

/// The same card on the request's own page, for the seller the buyer chose.
/// It reads the choice itself and shows nothing to anyone else.
export function ChosenOnRequest({ jobId, me }: { jobId: string; me: string | null }) {
  const [found, setFound] = useState<{ choice: ChoiceView; title: string | null } | null>(null);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!me) return;
    let stopped = false;
    void api.choice(jobId).then((r) => {
      if (stopped) return;
      const open = r.role === 'seller' && r.choice && (r.choice.state === 'waiting' || r.choice.state === 'raised');
      setFound(open && r.choice ? { choice: r.choice, title: r.title ?? null } : null);
    }).catch(() => undefined);
    return () => { stopped = true; };
  }, [jobId, me, tick]);
  if (!found || !me) return null;
  return <ChosenCard jobId={jobId} me={me} title={found.title} choice={found.choice} onDone={() => setTick((n) => n + 1)} />;
}
