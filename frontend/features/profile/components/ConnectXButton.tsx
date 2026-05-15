'use client';

/// The X wordmark glyph centered inside a black brand tile — mirrors the
/// Telegram pill on the same row so the two affordances read as a pair.
function XBrandTile({ size = 14 }: { size?: number }) {
  return (
    <span
      aria-hidden
      className="inline-flex items-center justify-center rounded-[5px] shrink-0 bg-black border border-white/12 text-white"
      style={{ width: size + 4, height: size + 4 }}
    >
      <svg width={size - 2} height={size - 2} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
      </svg>
    </span>
  );
}

/// Visual placeholder for X account binding. The real OAuth/handle flow is
/// parked; this surfaces the affordance with the proper X mark so the
/// profile header reflects where it is going. Matches TelegramConnectButton.
export function ConnectXButton() {
  return (
    <button
      type="button"
      disabled
      title="X account binding is coming soon"
      className="inline-flex items-center gap-2 px-3.5 py-1.5 mono text-[11px] font-bold uppercase tracking-[0.08em] border border-white/20 text-white/60 cursor-not-allowed w-fit"
      style={{
        borderTopLeftRadius: 8,
        borderTopRightRadius: 8,
        borderBottomLeftRadius: 8,
        borderBottomRightRadius: 2,
      }}
    >
      <XBrandTile />
      Connect X
      <span className="text-[9px] uppercase tracking-[0.12em] font-bold px-1.5 py-0.5 bg-white/[0.08] text-white/55 rounded-sm">
        Soon
      </span>
    </button>
  );
}
