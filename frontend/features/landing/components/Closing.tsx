'use client';

import Link from 'next/link';
import { DEALS_AVAILABLE } from '@/core/arcNetwork';
import { Icon } from '@/shared/components/Icon';
import { useLocale, useTranslations } from '@/shared/i18n/LocaleProvider';
import { TEAM_EMAIL, landingCopy } from '@/shared/i18n/messages/landing';
import { landingEntryRoutes } from '@/features/home/landingEntry';
import s from '../landing.module.css';

/// The Telegram link shows only once the bot's public handle is set.
const TELEGRAM_BOT = process.env.NEXT_PUBLIC_TELEGRAM_BOT?.replace(/^@/, '') || '';

/// Section 6: the way in. The footer is revealed under it like a curtain.
export function Closing() {
  const { locale } = useLocale();
  const editorial = useTranslations().landingEditorial;
  const t = (landingCopy[locale] ?? landingCopy.en).closing;
  const entry = landingEntryRoutes(DEALS_AVAILABLE);
  // Until mainnet deals open, say where trading happens today.
  const network = DEALS_AVAILABLE ? t.network : editorial.trade;
  const facts: [string, string, string?][] = [
    [t.languagesLabel, t.languages],
    [t.whereLabel, t.where],
    [t.networkLabel, network],
    [t.emailLabel, TEAM_EMAIL, `mailto:${TEAM_EMAIL}`],
  ];
  return (
    <section className={s.closing} aria-labelledby="landing-closing">
      <div className={s.glow} aria-hidden />
      <h2 id="landing-closing" className={s.closingTitle}><span>{t.titleFirst}</span> <span>{t.titleLast}</span></h2>
      <div className={s.closingActions}>
        <Link className={s.primary} href={entry.primary}>{DEALS_AVAILABLE ? t.open : t.waitlist}</Link>
        <a className={s.secondary} href={`mailto:${TEAM_EMAIL}`}>{t.team}</a>
        {TELEGRAM_BOT && (
          <a className={s.quietLink} href={`https://t.me/${TELEGRAM_BOT}`} target="_blank" rel="noopener noreferrer">
            {t.telegram}<Icon name="arrow-up-right" size={16} aria-hidden />
          </a>
        )}
      </div>
      <dl className={s.facts}>
        {facts.map(([label, value, href]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{href ? <a href={href}>{value}</a> : value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
