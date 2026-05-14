'use client';

/// The real X (formerly Twitter) wordmark glyph.
function XLogo({ size = 13 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

/// Visual placeholder for X account binding. The real OAuth/handle flow is
/// parked; this surfaces the affordance with the proper X logo so the profile
/// page reflects where it is going.
export function ConnectXButton() {
  return (
    <button
      type="button"
      disabled
      title="X account binding is coming soon"
      className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-md text-[12px] font-semibold tracking-tight border border-[var(--color-line-strong)] text-[var(--color-ink-dim)] cursor-not-allowed w-fit"
    >
      <XLogo />
      Connect X
      <span
        className="text-[9px] uppercase tracking-[0.1em] font-bold px-1.5 py-0.5 rounded-full"
        style={{
          background: 'var(--color-surface-2)',
          color: 'var(--color-ink-faint)',
        }}
      >
        Soon
      </span>
    </button>
  );
}
