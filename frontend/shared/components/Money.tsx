'use client';
import type { ReactNode } from 'react';

/// One treatment for money, everywhere it appears.
///
/// Money was being rendered a different way on every surface: a plain bold
/// number in the wallets list, a display figure with a coloured rail on the home
/// strip, ordinary body text on a deal page. Nothing marked a USDC amount as a
/// different KIND of thing from a count or a date, so the one number a user
/// actually came to check had no more weight than a label beside it.
///
/// Three rules, and they travel together:
///
/// 1. **A lime edge.** Money and only money carries it. The accent is otherwise
///    reserved for the primary action and one focal indicator per screen, which
///    is what makes it work here: if the eye is drawn to lime, it should be
///    drawn to the balance.
/// 2. **Display weight, tabular numerals.** Amounts are read by scanning and
///    compared down a column, so digits must not shift width between values.
/// 3. **Its own bordered card.** A figure sitting loose in a paragraph is a
///    fact; a figure in a card is a holding.
///
/// The colour is fixed rather than passed in. The home strip used to tint each
/// tile differently (lime, navy, green), which read as three unrelated widgets
/// instead of three views of the same balance.

/// The lime edge, as a positioned child. `start-0` so it flips under RTL.
function Edge() {
  return (
    <span
      aria-hidden
      className="absolute start-0 top-0 bottom-0 w-[3px]"
      style={{ background: 'var(--lp-accent)' }}
    />
  );
}

export function MoneyCard({
  children,
  className = '',
  compact,
}: {
  children: ReactNode;
  className?: string;
  /// Dense contexts (a wallet row in a list) take less padding than a headline
  /// tile, but keep the same edge and the same numerals.
  compact?: boolean;
}) {
  return (
    <div
      className={`relative overflow-hidden ${compact ? 'px-4 py-3' : 'px-4 py-4 md:px-5 md:py-5'} ${className}`}
      style={{
        background: 'var(--lp-card)',
        border: '1px solid var(--lp-border-light)',
        borderTopLeftRadius: 14,
        borderTopRightRadius: 14,
        borderBottomLeftRadius: 14,
        borderBottomRightRadius: 4,
      }}
    >
      <Edge />
      {children}
    </div>
  );
}

/// A USDC amount. `value` is already formatted; this decides how it reads, not
/// what it says.
export function MoneyValue({
  value,
  size = 'md',
  unit = 'USDC',
  showUnit = true,
}: {
  value: string;
  size?: 'sm' | 'md' | 'lg';
  unit?: string;
  /// Off when the unit is already stated by a column header, so a table does not
  /// repeat USDC on every row.
  showUnit?: boolean;
}) {
  const scale =
    size === 'lg'
      ? 'text-[clamp(1.4rem,5vw,2.4rem)]'
      : size === 'sm'
        ? 'text-[15px]'
        : 'text-[clamp(1.2rem,4.5vw,2rem)]';
  return (
    <p
      className={`font-sans ${scale} font-extrabold tabular-nums tracking-[-0.02em] leading-none text-[var(--lp-dark)]`}
    >
      {value}
      {showUnit ? (
        <span className="ms-1.5 mono text-[0.45em] font-bold uppercase tracking-[0.12em] align-baseline text-[var(--lp-text-muted)]">
          {unit}
        </span>
      ) : null}
    </p>
  );
}

/// The label under an amount. Mono, uppercase, and deliberately quiet: the
/// number is the thing being read, the label only says which number it is.
export function MoneyLabel({ children }: { children: ReactNode }) {
  return (
    <p className="mt-2 mono text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--lp-text-sub)]">
      {children}
    </p>
  );
}
