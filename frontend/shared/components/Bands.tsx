'use client';
import Link, { type LinkProps } from 'next/link';
import type { ReactNode } from 'react';
import { cn } from '@/shared/utils/cn';
import { Reveal } from './Reveal';
import { withoutTrailingArrow } from './CtaArrow';

/// Phantom-grade landing primitives for the in-app routes. Full-bleed band
/// sections, uppercase extrabold display headlines with lime-accent punctuation,
/// asymmetric-corner CTA pills with chunky drop shadow, bracket SectionTags.
/// Used by /app, /buyer, /seller, /activity.

export function FullBleed({ children }: { children: ReactNode }) {
  return <div className="-mt-10 -mb-10">{children}</div>;
}

export function Band({
  tone,
  children,
  overlay,
  className,
  compact,
  id,
  dataGuide,
}: {
  tone: 'dark' | 'light';
  children: ReactNode;
  overlay?: ReactNode;
  className?: string;
  compact?: boolean;
  id?: string;
  dataGuide?: string;
}) {
  const dark = tone === 'dark';
  return (
    <section
      id={id}
      data-guide={dataGuide}
      className={cn(
        'relative left-1/2 w-bleed -translate-x-1/2 overflow-hidden',
        dark ? 'bg-[var(--lp-band-dark)] text-white' : 'bg-[var(--lp-light)] text-[var(--lp-dark)]',
        className,
      )}
    >
      {overlay}
      <Reveal
        className={cn(
          'relative mx-auto max-w-[1440px] px-[clamp(20px,5vw,72px)]',
          compact ? 'py-[clamp(28px,4vw,48px)]' : 'py-[clamp(40px,6vw,88px)]',
        )}
      >
        {children}
      </Reveal>
    </section>
  );
}

export function GridOverlay({
  position = 'top-right',
}: {
  position?: 'top-right' | 'top-left' | 'center';
}) {
  const mask =
    position === 'top-left'
      ? 'radial-gradient(ellipse 90% 80% at 0% 0%, black, transparent 70%)'
      : position === 'center'
        ? 'radial-gradient(ellipse 80% 60% at 50% 50%, black, transparent 75%)'
        : 'radial-gradient(ellipse 90% 80% at 100% 0%, black, transparent 70%)';
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 opacity-50 grid-drift"
      style={{
        backgroundImage:
          'linear-gradient(rgba(255,255,255,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.06) 1px, transparent 1px)',
        backgroundSize: '80px 80px',
        maskImage: mask,
        WebkitMaskImage: mask,
      }}
    />
  );
}

export function SectionTag({
  children,
  tone = 'light',
  dot,
}: {
  children: ReactNode;
  tone?: 'dark' | 'light';
  dot?: 'live';
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-2 mono text-[11px] font-medium uppercase tracking-[0.16em]',
        tone === 'dark' ? 'text-white/60' : 'text-[var(--lp-text-muted)]',
      )}
    >
      {dot === 'live' ? (
        <span aria-hidden className="relative flex w-[7px] h-[7px]">
          <span
            className="absolute inset-0 rounded-full opacity-60 motion-safe:animate-ping"
            style={{ background: 'var(--lp-accent)' }}
          />
          <span
            className="relative inline-flex w-[7px] h-[7px] rounded-full"
            style={{ background: 'var(--lp-accent)' }}
          />
        </span>
      ) : (
        // Static eyebrows use a muted dot, not lime, so the accent stays reserved
        // for one thing per view and headlines carry the hierarchy.
        <span aria-hidden className="w-1 h-1 rounded-full bg-current opacity-40" />
      )}
      [:{children}:]
    </span>
  );
}

export function HeroHeadline({
  children,
  className,
  size = 'lg',
  as = 'h1',
}: {
  children: ReactNode;
  className?: string;
  size?: 'lg' | 'md' | 'sm';
  as?: 'h1' | 'h2';
}) {
  const sizeClass =
    size === 'lg'
      ? 'text-[clamp(2.5rem,6vw,4.75rem)]'
      : size === 'md'
        ? 'text-[clamp(2rem,4.6vw,3.75rem)]'
        : 'text-[clamp(1.75rem,3.6vw,2.75rem)]';
  const Heading = as;
  return (
    <Heading
      className={cn(
        'mt-7 font-sans font-extrabold uppercase tracking-[-0.025em] leading-[0.95] text-balance',
        sizeClass,
        className,
      )}
    >
      {children}
    </Heading>
  );
}

export function Punc({ children }: { children: ReactNode }) {
  return <span style={{ color: 'var(--lp-accent)' }}>{children}</span>;
}

export function Accent({ children }: { children: ReactNode }) {
  return <span style={{ color: 'var(--lp-accent)' }}>{children}</span>;
}

export function CTAPill({
  href,
  children,
  variant = 'primary',
  tone = 'dark',
  onClick,
  type,
  disabled,
  busy,
}: {
  href?: LinkProps['href'];
  children: ReactNode;
  variant?: 'primary' | 'secondary';
  tone?: 'dark' | 'light';
  onClick?: () => void;
  type?: 'button' | 'submit';
  disabled?: boolean;
  /// The action is in flight. Swapping the label alone was not enough: a
  /// confirm button that changes one word and greys out reads as dead, so on a
  /// phone people tap it again, and these are the buttons that move money. This
  /// keeps the button at full strength, blocks a second press, and shows the
  /// work as movement.
  busy?: boolean;
}) {
  const base =
    'group karwan-cta inline-flex items-center gap-2 px-[22px] py-[13px] mono text-[13px] font-semibold uppercase tracking-[0.08em] ' +
    'transition-[transform,box-shadow] duration-150 hover:-translate-y-0.5 active:translate-y-0 ' +
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-accent)] focus-visible:ring-offset-2 ' +
    'disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0';
  const corners = {
    borderTopLeftRadius: 14,
    borderTopRightRadius: 14,
    borderBottomLeftRadius: 14,
    borderBottomRightRadius: 4,
  };
  const fill =
    variant === 'primary'
      ? 'bg-[var(--lp-accent)] text-[var(--lp-band-dark)] shadow-[0_4px_0_rgba(0,0,0,0.22)] hover:shadow-[0_5px_0_rgba(0,0,0,0.22)] active:shadow-[0_1px_0_rgba(0,0,0,0.22)]'
      : tone === 'dark'
        ? 'border border-white/25 text-white hover:border-white/55'
        : 'border border-[var(--lp-outline-strong)] text-[var(--lp-dark)] hover:border-[var(--lp-outline-hover)]';
  const ringOffset =
    tone === 'dark'
      ? 'focus-visible:ring-offset-[var(--lp-dark)]'
      : 'focus-visible:ring-offset-[var(--lp-light)]';
  // A busy pill must NOT take the disabled fade: faded plus static is exactly
  // what read as "nothing happened".
  const className = cn(
    base,
    fill,
    ringOffset,
    busy && 'relative overflow-hidden cursor-progress disabled:opacity-100',
  );

  /// The pill renders its own arrow, and several CTA strings carry one inline
  /// ('Post a request →'), which showed as two arrows on every card using them.
  /// Stripped here rather than in the copy, because the same strings are also
  /// used where the inline arrow IS the arrow.
  const label = typeof children === 'string' ? withoutTrailingArrow(children) : children;

  if (href) {
    return (
      <Link href={href} style={corners} className={className}>
        {label}
        <span aria-hidden className="cta-arrow transition-transform duration-200 group-hover:translate-x-1">↗</span>
      </Link>
    );
  }
  return (
    <button
      type={type ?? 'button'}
      onClick={onClick}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      style={corners}
      className={className}
    >
      {label}
      {busy ? (
        <span aria-hidden className="cta-busy-dot" />
      ) : (
        <span aria-hidden className="cta-arrow transition-transform duration-200 group-hover:translate-x-1">↗</span>
      )}
      {busy && <span aria-hidden className="cta-busy-sweep" />}
    </button>
  );
}

export function BigStatTile({
  label,
  value,
  unit,
  hint,
  loading,
  tone = 'dark',
}: {
  label: string;
  value: ReactNode;
  unit?: string;
  hint?: string;
  loading?: boolean;
  tone?: 'dark' | 'light';
}) {
  const isDark = tone === 'dark';
  return (
    <div
      className="relative overflow-hidden p-5"
      style={{
        background: isDark ? 'rgba(255,255,255,0.04)' : 'var(--lp-card)',
        border: isDark
          ? '1px solid rgba(255,255,255,0.08)'
          : '1px solid var(--lp-border-light)',
        borderTopLeftRadius: 18,
        borderTopRightRadius: 18,
        borderBottomLeftRadius: 18,
        borderBottomRightRadius: 4,
      }}
    >
      <p
        className={cn(
          'mono text-[10px] uppercase tracking-[0.16em]',
          isDark ? 'text-white/55' : 'text-[var(--lp-text-muted)]',
        )}
      >
        {label}
      </p>
      {loading ? (
        <div
          className={cn(
            'mt-3 h-8 w-20 rounded animate-pulse motion-reduce:animate-none',
            isDark ? 'bg-white/[0.08]' : 'bg-black/[0.06]',
          )}
        />
      ) : (
        <div className="mt-3 flex min-w-0 flex-wrap items-baseline gap-x-1.5 gap-y-1">
          <span
            className={cn(
              'font-sans font-extrabold tabular-nums tracking-[-0.02em] leading-none',
              'min-w-0 max-w-full text-[clamp(1.75rem,8vw,2.75rem)]',
              isDark ? 'text-white' : 'text-[var(--lp-dark)]',
            )}
          >
            {value}
          </span>
          {unit && (
            <span
              className={cn(
                // Keep the currency visible at narrow widths. A long tabular
                // amount can consume the whole tile, so the unit gets its own
                // line on mobile instead of being clipped by the card's
                // intentional overflow boundary. Desktop keeps the compact
                // inline treatment.
                'mono shrink-0 basis-full text-[10px] uppercase tracking-[0.12em] sm:basis-auto',
                isDark ? 'text-white/55' : 'text-[var(--lp-text-muted)]',
              )}
            >
              {unit}
            </span>
          )}
        </div>
      )}
      {hint && (
        <p
          className={cn(
            'mt-1.5 mono text-[10px] uppercase tracking-[0.1em]',
            isDark ? 'text-white/45' : 'text-[var(--lp-text-muted)]',
          )}
        >
          {hint}
        </p>
      )}
    </div>
  );
}

export function PageCard({
  children,
  className,
  asymmetric = true,
  tone = 'card',
}: {
  children: ReactNode;
  className?: string;
  asymmetric?: boolean;
  tone?: 'card' | 'dark';
}) {
  const isDark = tone === 'dark';
  return (
    <div
      className={cn(
        'overflow-hidden',
        isDark
          ? 'bg-[var(--lp-band-dark)] text-white border border-white/[0.08]'
          : 'bg-[var(--lp-card)] text-[var(--lp-dark)] border border-[var(--lp-border-light)]',
        className,
      )}
      style={{
        borderTopLeftRadius: 22,
        borderTopRightRadius: 22,
        borderBottomLeftRadius: 22,
        borderBottomRightRadius: asymmetric ? 5 : 22,
        boxShadow: '0 1px 2px rgba(0,0,0,0.04), 0 18px 56px -20px rgba(0,0,0,0.12)',
      }}
    >
      {children}
    </div>
  );
}

export function AddressPill({ address, tone = 'dark' }: { address: string; tone?: 'dark' | 'light' }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-2 px-3 py-1.5 rounded-full mono text-[11px] uppercase tracking-[0.08em]',
        tone === 'dark'
          ? 'border border-white/15 text-white/65'
          : 'border border-[var(--lp-outline)] text-[var(--lp-dark)]/70',
      )}
    >
      <span aria-hidden className="w-1.5 h-1.5 rounded-full bg-[var(--lp-accent)]" />
      {address}
    </span>
  );
}
