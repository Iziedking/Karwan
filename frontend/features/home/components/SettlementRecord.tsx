'use client';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { api, type PublicFeedDeal } from '@/core/api';
import { useLocale, useTranslations } from '@/shared/i18n/LocaleProvider';
import { relativeTime } from '@/shared/utils/format';
import styles from '@/app/landing.module.css';
import { DealFolders, type DealStats } from './DealFolders';
import { agentReadFigure, settlementFigures, type AgentReadFigure, type SettlementFigures } from '../settlementRecord';

/// How payment moves through escrow, shown with the network's own record: the
/// all-time totals read from the contracts and the latest settled deals as
/// value ranges. Until the record loads, or if it cannot, the typical sequence
/// shows instead, labelled as an example.
export function SettlementRecord() {
  const t = useTranslations().landingEditorial;
  const lifetime = useQuery({
    queryKey: ['landing', 'lifetime'],
    queryFn: ({ signal }) => api.networkLifetime({ signal }),
    staleTime: 300_000,
    retry: 1,
  });
  const feed = useQuery({ queryKey: ['landing', 'feed'], queryFn: () => api.dealsFeed(), staleTime: 300_000, retry: 1 });
  const stats = useQuery({ queryKey: ['landing', 'stats'], queryFn: () => api.dealsStats(), staleTime: 300_000, retry: 1 });
  const reads = useQuery({
    queryKey: ['landing', 'reads'],
    queryFn: ({ signal }) => api.networkReads({ signal }),
    staleTime: 300_000,
    retry: 1,
  });
  const figures = settlementFigures(lifetime.data);

  return (
    <section className={styles.record} id="record" aria-labelledby="record-title">
      <div className={styles.wrap}>
        <p className={styles.eyebrow}>{t.recordLabel}</p>
        <div className={styles.recordHead}><h2 id="record-title">{t.recordTitle}</h2><p>{t.recordBody}</p></div>
        {figures ? (
          <LiveRecord figures={figures} reads={agentReadFigure(reads.data)} feed={feed.data?.deals} stats={stats.data} />
        ) : lifetime.isPending ? (
          <div className={styles.liveSkeleton} aria-hidden />
        ) : (
          <>
            <ol className={styles.recordLines}>
              {[[t.terms, t.both], [t.funded, t.buyer], [t.delivery, t.seller], [t.reviewed, t.buyer], [t.released, t.receipt]].map(([label, role]) => <li key={label}>{label}<span>{role}</span></li>)}
            </ol>
            <p className={styles.recordFoot}>{t.exampleNote}</p>
          </>
        )}
        <div className={styles.limit}>
          <h3>{t.limitTitle}</h3>
          <p>{t.limitBody}</p>
          <Link className={styles.textLink} href="/how-it-works">
            {t.rulesLink}
            <svg aria-hidden width="18" height="18" viewBox="0 0 24 24" fill="none" className="rtl-flip" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14m-6-6 6 6-6 6" /></svg>
          </Link>
        </div>
      </div>
    </section>
  );
}

function LiveRecord({ figures, reads, feed, stats }: { figures: SettlementFigures; reads: AgentReadFigure | null; feed: PublicFeedDeal[] | undefined; stats: DealStats | undefined }) {
  const messages = useTranslations();
  const t = messages.landingEditorial;
  const { locale } = useLocale();
  const whole = new Intl.NumberFormat(locale, { maximumFractionDigits: 0 });
  const rows: Array<[string, string, boolean]> = [
    [t.liveDeals, whole.format(figures.deals), false],
    [t.liveFunded, whole.format(figures.fundedUsdc), true],
    [t.liveReleased, whole.format(figures.releasedUsdc), true],
    [t.liveReturned, whole.format(figures.returnedUsdc), true],
  ];
  const day = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'long', year: 'numeric' });
  const source = (figures.testnet ? t.liveSourceTestnet : t.liveSource).replace('{time}', relativeTime(figures.scannedAt, locale));

  return (
    <>
      <div className={styles.live}>
        <div>
          <dl className={styles.liveFigures}>
            {rows.map(([label, value, usdc]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{value}{usdc ? <span> USDC</span> : null}</dd>
              </div>
            ))}
            {reads ? (
              <div>
                <dt>{t.liveReads}</dt>
                <dd>{whole.format(reads.reads)}</dd>
                <dd className={styles.liveSince}>{t.liveReadsSince.replace('{date}', day.format(reads.since))}</dd>
              </div>
            ) : null}
          </dl>
          <div className={styles.liveBar} aria-hidden>
            <span className={styles.liveReleased} style={{ width: `${figures.releasedShare}%` }} />
            <span className={styles.liveReturned} style={{ width: `${figures.returnedShare}%` }} />
          </div>
          <p className={styles.liveLegend}>
            <span><i className={styles.liveReleased} aria-hidden />{t.liveReleasedShare.replace('{n}', String(figures.releasedShare))}</span>
            <span><i className={styles.liveReturned} aria-hidden />{t.liveReturnedShare.replace('{n}', String(figures.returnedShare))}</span>
          </p>
        </div>
      </div>
      <DealFolders feed={feed} stats={stats} />
      <p className={styles.recordFoot}>{source}</p>
    </>
  );
}
