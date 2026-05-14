import Link from 'next/link';
import type { ReactNode } from 'react';
import { cn } from '@/shared/utils/cn';
import { shortAddress } from '@/shared/utils/format';

/// Shared app-page system: a lavender-equivalent light canvas with rounded
/// section cards that breathe, lime accent, round pills. Used by /app, /profile,
/// /buyer and /seller.

/* ---- shell ---- */

/// Full-bleed light canvas. Sections inside float on it with gaps.
export function AppCanvas({ children }: { children: ReactNode }) {
  return (
    <div className="-mt-10 -mb-10 relative left-1/2 w-screen -translate-x-1/2 bg-[var(--lp-light)]">
      <div className="mx-auto max-w-[1240px] px-6 py-6 space-y-4 min-h-[60vh]">{children}</div>
    </div>
  );
}

export function Section({
  tone = 'card',
  className,
  children,
}: {
  tone?: 'card' | 'dark' | 'accent';
  className?: string;
  children: ReactNode;
}) {
  const bg =
    tone === 'dark'
      ? 'bg-[var(--lp-dark)] text-white'
      : tone === 'accent'
      ? 'bg-[var(--lp-accent)] text-[var(--lp-dark)]'
      : 'bg-[var(--lp-card)] text-[var(--lp-dark)]';
  return <section className={cn('rounded-[28px] p-7 md:p-10', bg, className)}>{children}</section>;
}

export function GridOverlay() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 opacity-50"
      style={{
        backgroundImage:
          'linear-gradient(var(--lp-border-subtle) 1px, transparent 1px), linear-gradient(90deg, var(--lp-border-subtle) 1px, transparent 1px)',
        backgroundSize: '72px 72px',
        maskImage: 'radial-gradient(ellipse 80% 90% at 80% 10%, black, transparent 70%)',
        WebkitMaskImage: 'radial-gradient(ellipse 80% 90% at 80% 10%, black, transparent 70%)',
      }}
    />
  );
}

/* ---- controls ---- */

interface PillProps {
  children: ReactNode;
  variant?: 'primary' | 'secondary';
  tone?: 'dark' | 'light';
  href?: string;
  onClick?: () => void;
  type?: 'button' | 'submit';
  disabled?: boolean;
  className?: string;
}

/// Round pill. Renders a Link when `href` is set, otherwise a button.
export function Pill({
  children,
  variant = 'primary',
  tone = 'light',
  href,
  onClick,
  type = 'button',
  disabled,
  className,
}: PillProps) {
  const ring =
    tone === 'dark'
      ? 'focus-visible:ring-offset-[var(--lp-dark)]'
      : 'focus-visible:ring-offset-[var(--lp-light)]';
  const base = cn(
    'inline-flex items-center justify-center gap-2 rounded-full px-5 py-2.5 text-[13px] font-semibold',
    'transition-[transform,background-color,border-color,color] duration-200 ease-out',
    'hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2',
    'focus-visible:ring-[var(--lp-accent)] focus-visible:ring-offset-2',
    'disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0',
    ring,
    variant === 'primary'
      ? 'bg-[var(--lp-accent)] text-[var(--lp-dark)] hover:bg-[var(--lp-accent-hover)]'
      : tone === 'dark'
      ? 'border border-white/20 text-white hover:border-white/45 hover:bg-white/[0.06]'
      : 'border border-black/15 text-[var(--lp-dark)] hover:border-black/40 hover:bg-black/[0.04]',
    className,
  );
  if (href) {
    return (
      <Link href={href} className={base}>
        {children}
      </Link>
    );
  }
  return (
    <button type={type} onClick={onClick} disabled={disabled} className={base}>
      {children}
    </button>
  );
}

export function EyebrowChip({
  children,
  dot,
  tone = 'light',
}: {
  children: ReactNode;
  dot?: 'live' | 'warning';
  tone?: 'dark' | 'light';
}) {
  const dotColor = dot === 'warning' ? 'var(--color-warning)' : 'var(--lp-accent)';
  return (
    <span
      className={cn(
        'inline-flex items-center gap-2 rounded-full px-3 py-1.5 mono text-[12px] font-medium uppercase tracking-[0.06em]',
        tone === 'dark'
          ? 'bg-white/[0.07] text-[var(--lp-text-muted)]'
          : 'bg-[var(--lp-light)] text-[var(--lp-text-sub)]',
      )}
    >
      {dot && (
        <span aria-hidden className="relative flex size-1.5">
          <span
            className="absolute inline-flex h-full w-full rounded-full opacity-60 motion-safe:animate-ping"
            style={{ background: dotColor }}
          />
          <span
            className="relative inline-flex size-1.5 rounded-full"
            style={{ background: dotColor }}
          />
        </span>
      )}
      {children}
    </span>
  );
}

export function AddressChip({
  address,
  tone = 'light',
}: {
  address: string;
  tone?: 'dark' | 'light';
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 mono text-[11px]',
        tone === 'dark'
          ? 'bg-white/[0.07] text-[var(--lp-text-muted)]'
          : 'bg-[var(--lp-light)] text-[var(--lp-text-sub)]',
      )}
    >
      <span aria-hidden className="size-1.5 rounded-full bg-[var(--lp-accent)]" />
      {shortAddress(address)}
    </span>
  );
}

/* ---- content tiles ---- */

export function ActionTile({
  href,
  eyebrow,
  title,
  body,
  tone,
}: {
  href: string;
  eyebrow: string;
  title: string;
  body: string;
  tone: 'card' | 'dark' | 'accent';
}) {
  const bg =
    tone === 'dark'
      ? 'bg-[var(--lp-dark)] text-white'
      : tone === 'accent'
      ? 'bg-[var(--lp-accent)] text-[var(--lp-dark)]'
      : 'bg-[var(--lp-card)] text-[var(--lp-dark)]';
  const muted =
    tone === 'dark'
      ? 'text-[var(--lp-text-muted)]'
      : tone === 'accent'
      ? 'text-[var(--lp-dark)]/70'
      : 'text-[var(--lp-text-sub)]';
  return (
    <Link
      href={href}
      className={cn(
        'group block rounded-[24px] p-7 transition-transform duration-200 ease-out hover:scale-[1.02]',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--lp-light)]',
        bg,
      )}
    >
      <span className="mono text-[11px] uppercase tracking-[0.08em] opacity-70">{eyebrow}</span>
      <h3 className="mt-2 font-sans text-[20px] font-bold tracking-[-0.01em]">{title}</h3>
      <p className={cn('mt-2 text-[13px] leading-relaxed', muted)}>{body}</p>
      <span className="mt-4 inline-flex items-center gap-1 text-[13px] font-semibold">
        Open
        <span aria-hidden className="transition-transform duration-200 group-hover:translate-x-0.5">
          →
        </span>
      </span>
    </Link>
  );
}

export function StatTile({
  label,
  value,
  hint,
  loading,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  loading?: boolean;
}) {
  return (
    <div className="rounded-[18px] bg-white/[0.05] border border-[var(--lp-border-subtle)] p-4">
      <p className="mono text-[11px] uppercase tracking-[0.06em] text-[var(--lp-text-muted)]">
        {label}
      </p>
      {loading ? (
        <Skeleton className="mt-2.5 h-7 w-20 bg-white/[0.08]" />
      ) : (
        <p className="mt-1.5 font-sans text-[clamp(1.5rem,2.2vw,2rem)] font-bold tabular-nums tracking-[-0.02em]">
          {value}
        </p>
      )}
      {hint && <p className="mt-0.5 text-[11px] text-[var(--lp-text-muted)]">{hint}</p>}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn('animate-pulse motion-reduce:animate-none rounded-md bg-black/[0.06]', className)}
    />
  );
}

/* ---- wallet gate ---- */

export function WalletGate({
  title,
  body,
  note,
  children,
}: {
  title: string;
  body: string;
  note?: string;
  children: ReactNode;
}) {
  return (
    <Section tone="dark" className="relative overflow-hidden">
      <GridOverlay />
      <div className="relative max-w-lg">
        <EyebrowChip tone="dark">Sign in</EyebrowChip>
        <h1 className="mt-5 font-sans font-bold tracking-[-0.025em] leading-[1.02] text-[clamp(2rem,4vw,3.25rem)]">
          {title}
        </h1>
        <p className="mt-3 text-[15px] leading-relaxed text-[var(--lp-text-muted)]">{body}</p>
        <div className="mt-6">{children}</div>
        {note && <p className="mt-4 mono text-[12px] text-[var(--lp-text-sub)]">{note}</p>}
      </div>
    </Section>
  );
}
