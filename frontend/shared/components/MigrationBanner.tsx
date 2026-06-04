'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useTranslations } from '@/shared/i18n/LocaleProvider';

/// Env-gated infra-migration banner. Surfaces on /app whenever
/// `NEXT_PUBLIC_MIGRATION_NOTICE` is set in Vercel env. The value IS the
/// message (so we can update wording without a code deploy). When the env
/// is unset, the banner renders nothing.
///
/// Dismissal is keyed by a hash of the notice text so changing the message
/// re-surfaces the banner for everyone who already dismissed an older one.
export function MigrationBanner() {
  const t = useTranslations().banners.migration;
  const notice = process.env.NEXT_PUBLIC_MIGRATION_NOTICE ?? '';
  const noticeKey = useMemo(() => (notice ? hash(notice) : null), [notice]);
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    if (typeof window === 'undefined' || !noticeKey) return;
    const seen = window.localStorage.getItem('karwan.migration.dismissed');
    setDismissed(seen === noticeKey);
  }, [noticeKey]);

  if (!notice || dismissed) return null;

  return (
    <section
      role="status"
      aria-label={t.ariaLabel}
      className="relative left-1/2 w-bleed -translate-x-1/2 overflow-hidden"
      style={{ background: '#7a1f1a' }}
    >
      <div
        aria-hidden
        className="sheen-tl absolute inset-0 pointer-events-none opacity-50"
        style={{ ['--sheen-color' as string]: 'rgba(255,184,0,0.18)' }}
      />
      <div className="relative mx-auto max-w-[1440px] px-[clamp(20px,5vw,72px)] py-4 sm:py-5 flex items-center justify-between gap-4 flex-wrap">
        <div className="min-w-0 flex-1 flex items-start gap-3 sm:gap-4">
          <span
            className="hidden sm:flex shrink-0 items-center justify-center w-10 h-10 mono text-[16px] font-extrabold"
            style={{
              background: '#ffb800',
              color: '#3a0e0a',
              borderTopLeftRadius: 12,
              borderTopRightRadius: 12,
              borderBottomLeftRadius: 12,
              borderBottomRightRadius: 3,
            }}
            aria-hidden
          >
            !
          </span>
          <div className="min-w-0">
            <span
              className="inline-block mono text-[10px] font-bold uppercase tracking-[0.16em] px-2 py-0.5 mb-2"
              style={{ background: '#ffb800', color: '#3a0e0a', borderRadius: 3 }}
            >
              [:{t.eyebrow}:]
            </span>
            <p className="font-sans text-[15px] sm:text-[16px] font-semibold leading-snug text-white whitespace-pre-line">
              {notice}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Link
            href="/profile"
            className="inline-flex items-center gap-2 px-4 sm:px-5 py-2.5 mono text-[11px] sm:text-[12px] font-bold uppercase tracking-[0.1em] bg-white text-[#3a0e0a] hover:bg-white/90 transition-colors"
            style={{
              borderTopLeftRadius: 12,
              borderTopRightRadius: 12,
              borderBottomLeftRadius: 12,
              borderBottomRightRadius: 3,
            }}
          >
            {t.openProfile}
            <span aria-hidden>→</span>
          </Link>
          <button
            type="button"
            onClick={() => {
              if (!noticeKey) return;
              window.localStorage.setItem('karwan.migration.dismissed', noticeKey);
              setDismissed(true);
            }}
            aria-label={t.dismissAria}
            className="mono text-[12px] text-white/60 hover:text-white px-2 py-1 transition-colors"
          >
            ×
          </button>
        </div>
      </div>
    </section>
  );
}

/// Cheap, deterministic string hash. Same input always produces the same
/// localStorage key so a user only dismisses each unique notice once.
function hash(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = ((h * 31) | 0) + s.charCodeAt(i);
  }
  return `m${(h >>> 0).toString(36)}`;
}
