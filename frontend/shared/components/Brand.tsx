import Link from 'next/link';

/** Shared lockup: the canonical asset and one wordmark at every size. */
export function Brand() {
  return (
    <Link href="/" aria-label="Karwan" className="inline-flex min-h-11 shrink-0 items-center gap-2.5 text-[21px] font-semibold tracking-[-0.045em] text-[var(--lp-dark)]">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/karwan-app-icon.svg" alt="" width="34" height="34" className="size-[34px]" />
      <span>Karwan</span>
    </Link>
  );
}
