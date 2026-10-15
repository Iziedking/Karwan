'use client';
import { useEffect, useId, useRef, useState, type CSSProperties } from 'react';
import type { PublicFeedDeal } from '@/core/api';
import { Icon } from '@/shared/components/Icon';
import { useLocale, useTranslations } from '@/shared/i18n/LocaleProvider';
import { agentShare, fanSlot, feedKnowsOrigin, folderDeals } from '../dealFolders';
import styles from './DealFolders.module.css';

/// The latest settlements as two folders: every settled deal, and the ones an
/// agent matched. Each card is a value range and a date; who traded and the
/// exact amount never reach the page. The counts come from the app's own deal
/// record, so they are labelled apart from the contract figures above them.
export interface DealStats { total: number; direct: number; agent: number; settled: number }

export function DealFolders({ feed, stats }: { feed: PublicFeedDeal[] | undefined; stats: DealStats | undefined }) {
  const t = useTranslations().landingEditorial;
  const { locale } = useLocale();
  const whole = new Intl.NumberFormat(locale, { maximumFractionDigits: 0 });
  const share = agentShare(stats);
  if (!stats || share === null) return null;

  return (
    <div className={styles.wrap}>
      <div className={styles.row}>
        <Folder
          label={t.folderSettled}
          figure={whole.format(stats.settled)}
          meta={t.folderSettledMeta.replace('{total}', whole.format(stats.total))}
          deals={folderDeals(feed)}
        />
        <Folder
          label={t.folderAgent}
          figure={whole.format(stats.agent)}
          meta={t.folderAgentMeta.replace('{share}', String(share)).replace('{direct}', whole.format(stats.direct))}
          deals={folderDeals(feed, 'agent')}
          empty={feedKnowsOrigin(feed) ? t.folderNoAgent : undefined}
        />
      </div>
    </div>
  );
}

function Folder({ label, figure, meta, deals, empty }: { label: string; figure: string; meta: string; deals: PublicFeedDeal[]; empty?: string }) {
  const messages = useTranslations();
  const t = messages.landingEditorial;
  const bands = messages.sealedRecord.bands;
  const { locale } = useLocale();
  const day = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short' });
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const listId = useId();
  const canOpen = deals.length > 0;

  // Escape or a press outside closes an open folder.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    const onDown = (e: PointerEvent) => { if (!root.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onDown);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onDown);
    };
  }, [open]);

  return (
    <div ref={root} className={styles.folder} data-open={open || undefined} data-static={canOpen ? undefined : true}>
      <div className={styles.tab} aria-hidden />
      <div className={styles.back} aria-hidden />
      <ul id={listId} className={styles.cards} aria-label={label}>
        {deals.map((deal, i) => (
          <li
            key={`${deal.settledAt}-${i}`}
            className={styles.card}
            style={{ '--slot': fanSlot(i, deals.length), '--depth': deals.length - 1 - i, zIndex: i + 1 } as CSSProperties}
          >
            <span className={styles.band}>{bands[deal.amountBand]} USDC</span>
            <span className={styles.date}>{t.folderSettledOn.replace('{date}', day.format(deal.settledAt))}</span>
          </li>
        ))}
      </ul>
      <button
        type="button"
        className={styles.front}
        aria-expanded={open}
        aria-controls={listId}
        disabled={!canOpen}
        aria-label={(open ? t.folderHide : t.folderShow).replace('{label}', label)}
        onClick={() => setOpen((o) => !o)}
      >
        <span className={styles.figure}>{figure}</span>
        <span className={styles.label}>{label}</span>
        <span className={styles.meta}>{canOpen ? meta : empty ?? meta}</span>
        {canOpen ? (
          <span className={styles.key} aria-hidden>
            <Icon name="chevron-right" size={20} className={styles.chevron} />
          </span>
        ) : null}
      </button>
    </div>
  );
}
