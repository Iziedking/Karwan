'use client';
import { useEffect, useState } from 'react';
import { api } from '@/core/api';
import { useLocale, useTranslations } from '@/shared/i18n/LocaleProvider';
import { Row, RowGroup, ToggleRow } from './ProfileUi';
import { readerLine } from '../reputationSources';

type Sources = Awaited<ReturnType<typeof api.reputationSources>>;

const INTEREST_MAX = 280;

/// Profile, Reputation: the person decides whether agents may check their
/// record and look them up elsewhere, and sees who read it. Nothing here moves
/// money; reads draw on the buying agent's own funds.
export function ReputationSources({ address }: { address: string }) {
  const copy = useTranslations().reputationSources;
  const { locale } = useLocale();
  const [data, setData] = useState<Sources | null>(null);
  const [interest, setInterest] = useState('');
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    api
      .reputationSources(address)
      .then((next) => {
        if (!live) return;
        setData(next);
        setInterest(next.sources.interest);
      })
      .catch(() => {
        if (live) setError(copy.failed);
      });
    return () => {
      live = false;
    };
  }, [address, copy.failed]);

  async function update(patch: { recordReadable?: boolean; sourceLookup?: boolean; interest?: string }) {
    setError(null);
    setSaved(false);
    try {
      const { sources } = await api.updateReputationSources(address, patch);
      setData((d) => (d ? { ...d, sources: { ...d.sources, ...sources } } : d));
      if (patch.interest !== undefined) setSaved(true);
    } catch {
      setError(copy.failed);
    }
  }

  if (!data) return error ? <p className="text-[14px] font-medium text-[var(--lp-dark)]">{error}</p> : null;

  return (
    <div data-guide="profile-reputation" className="space-y-7">
      <RowGroup title={copy.title} hint={copy.titleTip}>
        <ToggleRow
          label={copy.readable}
          note={copy.readableNote}
          checked={data.sources.recordReadable}
          onChange={(next) => void update({ recordReadable: next })}
        />
        <ToggleRow
          label={copy.lookup}
          note={copy.lookupNote}
          checked={data.sources.sourceLookup}
          onChange={(next) => void update({ sourceLookup: next })}
        />
      </RowGroup>

      <RowGroup title={copy.sources} hint={copy.sourcesTip}>
        <Row label={copy.karwan} value={copy.connected} />
        <Row label={copy.otherPlatforms} value={copy.noPartners} />
      </RowGroup>

      <div>
        <label htmlFor="reputation-elsewhere" className="block text-[15px] font-semibold text-[var(--lp-dark)]">
          {copy.elsewhere}
        </label>
        <p className="mt-1 text-[14px] font-medium text-[var(--lp-text-sub)]">{copy.elsewhereNote}</p>
        <textarea
          id="reputation-elsewhere"
          rows={2}
          maxLength={INTEREST_MAX}
          value={interest}
          placeholder={copy.elsewherePlaceholder}
          onChange={(e) => {
            setInterest(e.target.value);
            setSaved(false);
          }}
          className="mt-2 w-full rounded-[14px] border border-[var(--lp-border-light)] bg-[var(--lp-card)] px-3 py-2.5 text-[15px] text-[var(--lp-dark)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-accent)]"
        />
        <div className="mt-2 flex items-center gap-3">
          <button
            type="button"
            disabled={interest.trim() === data.sources.interest}
            onClick={() => void update({ interest })}
            className="inline-flex min-h-11 items-center rounded-full border border-[var(--lp-border-light)] px-5 text-[14px] font-semibold text-[var(--lp-dark)] disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-accent)]"
          >
            {copy.save}
          </button>
          {saved ? <span role="status" className="text-[14px] font-medium text-[var(--lp-text-sub)]">{copy.saved}</span> : null}
        </div>
      </div>

      <RowGroup title={copy.balance} hint={copy.balanceTip}>
        <Row
          label={<span className="block"><span className="block">{copy.balance}</span><span className="block text-[14px] font-medium text-[var(--lp-text-sub)]">{copy.balanceNote}</span></span>}
          value={data.readsBalanceUsdc === null ? copy.balanceUnavailable : `${data.readsBalanceUsdc.toFixed(2)} USDC`}
        />
        <Row label={copy.fundAgent} href="/profile/agent-funds" />
      </RowGroup>

      <RowGroup title={copy.readers} hint={copy.readersTip}>
        {data.readers.length ? (
          data.readers.map((r) => <Row key={`${r.tag ?? r.name}-${r.at}`} label={readerLine(r, copy, locale)} />)
        ) : (
          <Row label={copy.noReaders} />
        )}
      </RowGroup>

      {error ? <p role="alert" className="text-[14px] font-medium text-[var(--lp-dark)]">{error}</p> : null}
    </div>
  );
}
