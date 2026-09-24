'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { cn } from '@/shared/utils/cn';
import { useTranslations } from '@/shared/i18n/LocaleProvider';
import { api } from '@/core/api';
import { Brand } from './Brand';
import { NetworkContext } from './NetworkContext';
import { settlementChain } from '@/core/arcNetwork';
import { networkPresentation } from '@/shared/chain/networkPresentation';
import styles from './SiteFooter.module.css';

const SUPPORT_EMAIL = 'support@karwan.site';

// Shared brand and navigation follow the selected theme on every public route.
export function SiteFooter() {
  const pathname = usePathname();
  const messages = useTranslations();
  const t = messages.footer;
  const network = networkPresentation(settlementChain);
  const landing = pathname === '/';
  const footerRef = useRef<HTMLElement>(null);
  const [reduced, setReduced] = useState(true);
  const [inView, setInView] = useState(false);
  const [visible, setVisible] = useState(false);
  const running = landing && !reduced && inView && visible;

  useEffect(() => {
    if (!landing) return;
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const syncMotion = () => setReduced(preference.matches);
    const syncVisibility = () => setVisible(!document.hidden);
    syncMotion();
    syncVisibility();
    preference.addEventListener('change', syncMotion);
    document.addEventListener('visibilitychange', syncVisibility);
    const observer = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting));
    if (footerRef.current) observer.observe(footerRef.current);
    return () => {
      preference.removeEventListener('change', syncMotion);
      document.removeEventListener('visibilitychange', syncVisibility);
      observer.disconnect();
    };
  }, [landing]);

  if (pathname === '/market' || pathname === '/listings' || pathname.startsWith('/listings/')) {
    return null;
  }
  return (
    <footer
      ref={footerRef}
      id="site-footer"
      className={cn(styles.footer, landing && styles.landing)}
      data-running={running}
    >
      {landing && <FooterWaves />}
      <div className={styles.shell}>
        <div
          className={styles.panel}
        >
          <div className="grid gap-8 lg:grid-cols-[0.95fr_2fr] lg:gap-10">
            {/* LEFT. logo block, editorial */}
            <div className="space-y-5">
              <Brand />
              <p className="text-pretty text-[15px] leading-relaxed text-[var(--lp-text-sub)] max-w-[34ch]">
                {messages.landingEditorial.kicker}.
              </p>
              <p className="text-[13px] font-semibold text-[var(--lp-text-sub)]">{messages.networkUi.poweredByArc}</p>
              <NewsletterSignup />
            </div>

            {/* Two columns on phones, three when the labels have room. */}
            <div className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 sm:gap-x-7 md:gap-y-8">
              <FooterCol title={t.columns.product}>
                {/* Keep this menu useful and stable across the landing page and
                    the app. Contact stays last so the list reads like the
                    reference Product menu. */}
                <>
                  <FooterLink href="/market">{messages.nav.market}</FooterLink>
                  <FooterLink href="/activity">{t.productLinks.activity}</FooterLink>
                  <FooterLink href="/how-it-works">{t.productLinks.howItWorks}</FooterLink>
                  <FooterLink href="/docs">{t.productLinks.docs}</FooterLink>
                  <FooterLink href="/brand">{t.productLinks.brand}</FooterLink>
                  <FooterLink href="/terms">{t.productLinks.terms}</FooterLink>
                  <FooterLink href="/feedback">{t.productLinks.feedback}</FooterLink>
                </>
                <FooterContact label={t.productLinks.contact} />
              </FooterCol>
              <FooterCol title={t.columns.network}>
                <FooterLink href="https://docs.arc.network" external>
                  {t.networkLinks.arcDocs}
                </FooterLink>
                <FooterLink href="https://developers.circle.com" external>
                  {t.networkLinks.circleDocs}
                </FooterLink>
                {network.explorerUrl && <FooterLink href={network.explorerUrl} external>{messages.networkUi.explorer}</FooterLink>}
                <NetworkContext disclosure />
              </FooterCol>
              <FooterCol
                title={t.columns.socials}
                className="col-span-2 sm:col-span-1"
                linksClassName="flex-row flex-wrap gap-x-5 gap-y-2.5 sm:flex-col sm:gap-x-0"
              >
                <FooterSocialLink href="https://x.com/karwanBuild" label="X" glyph={<XGlyph />} />
                <FooterSocialLink
                  href="https://www.linkedin.com/company/karwanbuild"
                  label="LinkedIn"
                  glyph={<LIGlyph />}
                />
                <FooterSocialLink
                  href="https://discord.com"
                  label="Discord"
                  glyph={<DCGlyph />}
                />
              </FooterCol>
            </div>
          </div>

          <div className={styles.bottom}>
            <div className="ms-auto flex flex-wrap items-center gap-x-3 gap-y-1 font-sans text-[12px] leading-relaxed text-[var(--lp-text-muted)]">
              <span>{t.copyright.entity}</span>
              <span aria-hidden className="hidden sm:inline-block w-px h-3 bg-[var(--lp-border-light)]" />
              <span>{t.copyright.tagline}</span>
            </div>
          </div>
        </div>

      </div>
    </footer>
  );
}

/** The supplied film's edge waves, redrawn in brand colors; never product data. */
function FooterWaves() {
  return (
    <div id="footer-waves" className={styles.waves} aria-hidden="true">
      <svg className={styles.upperWaves} viewBox="0 0 1600 260" preserveAspectRatio="none" focusable="false">
        <g className={styles.waveFar}>
          <path fill="#cbd5da" d="M-140-80H1740V115C1500 240 1310 55 1130 78S770 174 590 42 165 160-140 110Z" />
        </g>
        <g className={styles.waveNear}>
          <path fill="var(--karwan-green)" d="M850-80H1740V100C1500 190 1460 8 1280 32S1040 95 850-80Z" />
          <path d="M870-30C1120 134 1130-45 1400 48S1680 120 1770 15" fill="none" stroke="#52621e" strokeWidth="1" />
        </g>
      </svg>
      <svg className={styles.lowerWaves} viewBox="0 0 1600 310" preserveAspectRatio="none" focusable="false">
        <g className={styles.waveFar}>
          <path fill="#cbd5da" d="M-140 60C190-50 350 247 700 167S1250 33 1740 130V430H-140Z" />
        </g>
        <g className={styles.waveMiddle}>
          <path fill="var(--karwan-green)" d="M-140 162C65-10 280 50 455 160S800 300 1110 175 1510 170 1740 190V430H-140Z" />
          <path d="M-140 95C180 3 304 139 496 195S891 283 1190 152 1530 198 1770 143" fill="none" stroke="#647827" strokeWidth="1" />
        </g>
        <g className={styles.waveNear}>
          <path fill="#151c17" d="M-140 254C140 136 235 199 452 263S846 271 1070 224 1462 173 1740 277V430H-140Z" />
          <path d="M-140 294C170 182 277 224 482 283S850 290 1095 243 1500 235 1770 302" fill="none" stroke="#798671" strokeWidth="1" />
        </g>
      </svg>
    </div>
  );
}

/* ---- pieces ---- */

/// Newsletter opt-in. This is a marketing subscription, deliberately separate
/// from a user's verified contact email: subscribing here only adds the address
/// to the broadcast list, and an unsubscribe later never touches the verified
/// email on their account.
function NewsletterSignup() {
  const t = useTranslations().footer.newsletter;
  const [email, setEmail] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'done' | 'error'>('idle');
  const [message, setMessage] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const value = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      setState('error');
      setMessage(t.invalid);
      return;
    }
    setState('sending');
    setMessage(null);
    try {
      await api.subscribeNewsletter(value);
      setState('done');
      setMessage(t.success);
      setEmail('');
    } catch {
      setState('error');
      setMessage(t.error);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-2.5 pt-1">
      <p className="text-sm font-semibold text-[var(--lp-text-sub)]">
        {t.title}
      </p>
      <p className="text-[13px] leading-relaxed text-[var(--lp-text-sub)] max-w-[34ch]">
        {t.blurb}
      </p>
      <div className="flex max-w-[360px] flex-col items-stretch gap-2 min-[380px]:flex-row">
        <input
          type="email"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            if (state !== 'idle') setState('idle');
            setMessage(null);
          }}
          placeholder={t.placeholder}
          maxLength={200}
          aria-label={t.title}
          className="min-h-11 min-w-0 flex-1 px-3 py-2 text-[13.5px] bg-[var(--lp-light)] text-[var(--lp-dark)] border border-[var(--lp-field-border)] placeholder:text-[var(--lp-text-muted)] focus:border-[var(--lp-dark)] transition-colors"
          style={{ borderRadius: 10 }}
        />
        <button
          type="submit"
          disabled={state === 'sending'}
          className="min-h-11 w-full shrink-0 px-4 py-2 text-sm font-semibold bg-[var(--lp-control-active-bg)] text-[var(--lp-control-active-ink)] disabled:opacity-60 min-[380px]:w-auto"
          style={{ borderRadius: 10 }}
        >
          {state === 'sending' ? t.sending : t.cta}
        </button>
      </div>
      {message ? (
        <p
          role="status"
          className="text-sm"
          style={{ color: state === 'error' ? 'var(--lp-critical)' : 'var(--lp-dark)' }}
        >
          {message}
        </p>
      ) : null}
    </form>
  );
}

function FooterCol({
  title,
  children,
  className,
  linksClassName,
}: {
  title: string;
  children: ReactNode;
  className?: string;
  linksClassName?: string;
}) {
  return (
    <div className={className}>
      <p className="text-[14px] font-semibold text-[var(--lp-text-sub)] mb-3 sm:mb-4">
        {title}
      </p>
      <div className={cn('flex flex-col gap-2 sm:gap-2.5', linksClassName)}>{children}</div>
    </div>
  );
}

function FooterLink({
  href,
  children,
  external,
}: {
  href: string;
  children: ReactNode;
  external?: boolean;
}) {
  const className = cn(
    'group inline-flex min-h-11 min-w-11 items-center gap-1.5 w-fit py-2 text-[14px] sm:text-[15px] font-medium tracking-[-0.005em]',
    'text-[var(--lp-dark)]/85 hover:text-[var(--lp-dark)] transition-colors',
  );
  const inner = (
    <>
      <span className="group-hover:underline underline-offset-4">
        {children}
      </span>
      {external && (
        <svg
          width="10"
          height="10"
          viewBox="0 0 16 16"
          fill="none"
          aria-hidden
          className="transition-transform duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
        >
          <path
            d="M5.5 4.5h6v6M11 5l-6.5 6.5"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
          />
        </svg>
      )}
    </>
  );
  if (external) {
    return (
      <a href={href} target="_blank" rel="noreferrer" className={className}>
        {inner}
      </a>
    );
  }
  return (
    <Link href={href} className={className}>
      {inner}
    </Link>
  );
}

/// Contact entry. Renders a button that, on click, swaps inline to expose
/// the support email as a mailto link. Per the user's spec: don't put the
/// address in the footer up front; reveal it when someone actually wants
/// it. Keeps the column compact and discourages basic scraping.
function FooterContact({ label }: { label: string }) {
  const [revealed, setRevealed] = useState(false);
  const className = cn(
    'group inline-flex min-h-11 min-w-11 items-center gap-1.5 w-fit py-2 text-[14px] sm:text-[15px] font-medium tracking-[-0.005em]',
    'text-[var(--lp-dark)]/85 hover:text-[var(--lp-dark)] transition-colors',
  );
  if (revealed) {
    return (
      <a href={`mailto:${SUPPORT_EMAIL}`} className={className}>
        <span className="inline-block">{SUPPORT_EMAIL}</span>
      </a>
    );
  }
  return (
    <button type="button" onClick={() => setRevealed(true)} className={className}>
      <span className="group-hover:underline underline-offset-4">
        {label}
      </span>
    </button>
  );
}

function FooterSocialLink({
  href,
  label,
  glyph,
}: {
  href: string;
  label: string;
  glyph: ReactNode;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      aria-label={label}
      className="group inline-flex min-h-11 min-w-11 items-center gap-2 py-2 sm:gap-2.5 w-fit text-[14px] sm:text-[15px] font-medium tracking-[-0.005em] text-[var(--lp-dark)]/85 hover:text-[var(--lp-dark)] transition-colors"
    >
      <span
        aria-hidden
        className="inline-flex items-center justify-center w-6 h-6 sm:w-7 sm:h-7 rounded-md bg-[var(--lp-light)] border border-[var(--lp-border-light)] text-[var(--lp-dark)] transition-[transform,background-color,border-color] duration-200 group-hover:-translate-y-0.5 group-hover:bg-[var(--lp-band-dark)] group-hover:text-[var(--lp-accent)] group-hover:border-[var(--lp-dark)]"
      >
        {glyph}
      </span>
      <span className="inline-block transition-transform duration-200 group-hover:translate-x-0.5">
        {label}
      </span>
    </a>
  );
}

/* ---- glyphs ---- */

function XGlyph() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M18.9 2H22l-7.1 8.1L23 22h-6.6l-5.2-6.8L5.3 22H2.2l7.6-8.7L1.4 2H8l4.7 6.2L18.9 2zm-1.1 18.1h1.7L7.3 3.8H5.5l12.3 16.3z" />
    </svg>
  );
}

function LIGlyph() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M4.98 3.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5zM3 9h4v12H3zM10 9h3.8v1.7h.05c.53-1 1.83-2.05 3.77-2.05 4.03 0 4.78 2.65 4.78 6.1V21h-4v-5.4c0-1.3-.02-2.95-1.8-2.95-1.8 0-2.07 1.4-2.07 2.85V21h-4z" />
    </svg>
  );
}

function DCGlyph() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M19.3 5.3A17 17 0 0 0 15.1 4l-.25.45a15.7 15.7 0 0 1 3.6 1.16 13 13 0 0 0-11 0A15.7 15.7 0 0 1 11.1 4.45L10.85 4a17 17 0 0 0-4.2 1.3C4 9.3 3.3 13.2 3.65 17a17.3 17.3 0 0 0 5.2 2.6l.62-1.04a11 11 0 0 1-1.74-.83l.43-.32a12 12 0 0 0 10.1 0l.43.32c-.55.33-1.13.6-1.74.83l.62 1.04a17.3 17.3 0 0 0 5.2-2.6c.43-4.5-.66-8.37-3-11.7zM9.7 14.6c-1.02 0-1.86-.93-1.86-2.07 0-1.14.82-2.07 1.86-2.07s1.88.94 1.86 2.07c0 1.14-.83 2.07-1.86 2.07zm4.6 0c-1.02 0-1.86-.93-1.86-2.07 0-1.14.82-2.07 1.86-2.07s1.88.94 1.86 2.07c0 1.14-.82 2.07-1.86 2.07z" />
    </svg>
  );
}
