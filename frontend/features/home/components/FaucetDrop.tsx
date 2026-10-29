'use client';

import Link from 'next/link';
import { useEffect, useId, useRef, useState } from 'react';
import { useTranslations } from '@/shared/i18n/LocaleProvider';

/// Testnet only: a drop in the corner of Home. A mouse over it shows what it
/// is with Claim; a tap, Enter or Space opens the same card, and Escape or a
/// press outside closes it (view 39).
export function FaucetDrop() {
  const home = useTranslations().accountHome;
  const [pinned, setPinned] = useState(false);
  const [hovered, setHovered] = useState(false);
  const open = pinned || hovered;
  const setOpen = (v: boolean) => {
    setPinned(v);
    if (!v) setHovered(false);
  };
  const box = useRef<HTMLDivElement>(null);
  const cardId = useId();

  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', away);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('pointerdown', away);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);

  return (
    <div
      ref={box}
      className="relative shrink-0"
      data-guide="home-faucet"
      onPointerEnter={(e) => { if (e.pointerType === 'mouse') setHovered(true); }}
      onPointerLeave={(e) => { if (e.pointerType === 'mouse') setHovered(false); }}
    >
      <button
        type="button"
        aria-label={`${home.faucetLabel}. ${home.faucetBody}`}
        aria-expanded={open}
        aria-controls={cardId}
        onClick={() => setOpen(!pinned)}
        className="grid size-11 place-items-center rounded-full border border-[var(--faucet-strip-line)] bg-[var(--lp-card)] transition-colors hover:border-[var(--lp-accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-accent)]"
      >
        <svg aria-hidden width="18" height="18" viewBox="0 0 24 24" fill="var(--lp-accent)" stroke="var(--lp-accent-on-light)" strokeWidth="1.6" strokeLinejoin="round"><path d="M12 3s6 6.4 6 11a6 6 0 0 1-12 0c0-4.6 6-11 6-11z" /></svg>
      </button>
      <div
        id={cardId}
        role="group"
        aria-label={home.faucetLabel}
        className={`absolute end-0 top-full z-30 mt-2 w-[min(280px,calc(100vw-32px))] rounded-[16px] border border-[var(--faucet-strip-line)] bg-[var(--faucet-strip)] p-3.5 text-[var(--lp-dark)] transition-opacity duration-200 motion-reduce:transition-none ${
          open ? 'visible opacity-100' : 'invisible opacity-0'
        }`}
      >
        <p className="text-[15px] leading-snug">
          <span className="font-bold">{home.faucetLabel}</span> · {home.faucetBody}
        </p>
        <Link
          href="/profile/wallets"
          className="mt-3 inline-flex min-h-11 w-full items-center justify-center rounded-full bg-[var(--lp-dark)] px-4 text-[14px] font-semibold text-[var(--lp-card)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-accent)] focus-visible:ring-offset-2"
        >
          {home.faucetClaim}
        </Link>
      </div>
    </div>
  );
}
