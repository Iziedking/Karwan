'use client';
import { useEffect, useId, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { DEALS_AVAILABLE } from '@/core/arcNetwork';
import { useTranslations } from '@/shared/i18n/LocaleProvider';
import { START_ROUTE, WALLET_HOME } from '@/shared/utils/routes';

/// Below the width where the public links fit in the bar, they move into a
/// menu. The panel hangs under the sticky bar without changing its measured
/// height, which the landing panels depend on.
export function PublicMenu() {
  const t = useTranslations();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setOpen(false);
      buttonRef.current?.focus();
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const linkClass = 'flex min-h-12 items-center border-b border-[var(--color-line)] text-[16px] font-medium text-[var(--lp-dark)]';
  return (
    <div ref={rootRef} className="lg:hidden">
      <button
        ref={buttonRef}
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={open ? t.nav.menuCloseAria : t.nav.menuOpenAria}
        onClick={() => setOpen((value) => !value)}
        className="inline-flex h-11 w-11 items-center justify-center rounded-[10px] border border-[var(--color-line)] text-[var(--color-ink)] transition-colors hover:bg-[var(--color-surface-2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-accent)]"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
          {open ? (
            <path d="M6 6l12 12M18 6 6 18" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
          ) : (
            <path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
          )}
        </svg>
      </button>
      {open ? (
        <nav
          id={panelId}
          aria-label={t.footer.columns.product}
          className="fixed inset-x-0 z-40 border-b border-[var(--color-line)] bg-[var(--lp-workspace-band)] px-4 pb-5 pt-1 sm:px-6"
          style={{ top: 'var(--lp-nav-h, 64px)' }}
        >
          <Link className={linkClass} href="/how-it-works">{t.footer.productLinks.howItWorks}</Link>
          {DEALS_AVAILABLE ? <Link className={linkClass} href="/market">{t.nav.market}</Link> : null}
          <Link className={linkClass} href="/docs">{t.footer.productLinks.docs}</Link>
          <Link
            href={START_ROUTE}
            className="mt-4 flex min-h-12 w-full items-center justify-center gap-2 rounded-[10px] border border-[var(--color-line-strong)] text-[15px] font-semibold text-[var(--lp-dark)] md:hidden"
          >
            {t.nav.openApp}
            <span aria-hidden className="rtl-flip">→</span>
          </Link>
        </nav>
      ) : null}
    </div>
  );
}
