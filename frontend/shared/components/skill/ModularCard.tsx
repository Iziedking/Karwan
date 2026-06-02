'use client';
import { motion } from 'motion/react';
import type { ReactNode } from 'react';
import Link from 'next/link';
import { cn } from '@/shared/utils/cn';
import { dur, ease } from '@/shared/motion/tokens';
import { BracketTag, type BracketTagVariant } from './BracketTag';

/// SKILL.md §4.6 — the modular feature/entity card. Dark surface, 1px hairline
/// (no shadow on dark per skill §2.5), bracket label bottom-left, title under
/// it, arrow bottom-right. Visual area takes ~60% of card height. Hover: arrow
/// slides 4px right + hairline brightens to rgba(255,255,255,0.18). Click whole
/// card, not just the arrow (skill §4.6).
///
/// Aspect ratio per the skill: 4:5 in grids, 16:9 in hero rows. Pass `wide` for
/// 16:9, omit for 4:5.

export function ModularCard({
  tag,
  tagVariant = 'default',
  title,
  href,
  visual,
  wide = false,
  onDark = true,
  topRight,
  className,
}: {
  tag: ReactNode;
  tagVariant?: BracketTagVariant;
  title: ReactNode;
  href?: string;
  visual?: ReactNode;
  wide?: boolean;
  onDark?: boolean;
  topRight?: ReactNode;
  className?: string;
}) {
  const body = (
    <motion.div
      whileHover={{ y: -1.5 }}
      transition={{ duration: dur.fast, ease: ease.out }}
      className={cn(
        'group relative flex flex-col overflow-hidden',
        wide ? 'aspect-[16/9]' : 'aspect-[4/5]',
        className,
      )}
      style={{
        background: onDark ? 'var(--surface-1)' : 'var(--paper-1)',
        border: `1px solid ${onDark ? 'var(--rule-dark)' : 'var(--rule-light)'}`,
        borderRadius: 14,
      }}
    >
      {/* faint grid pattern per skill §4.6 */}
      <div
        aria-hidden
        className="absolute inset-0 pointer-events-none opacity-40 transition-opacity duration-[var(--dur-fast)] group-hover:opacity-60"
        style={{
          backgroundImage: onDark
            ? 'linear-gradient(rgba(255,255,255,0.035) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.035) 1px, transparent 1px)'
            : 'linear-gradient(rgba(10,10,11,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(10,10,11,0.04) 1px, transparent 1px)',
          backgroundSize: '32px 32px',
          maskImage:
            'radial-gradient(ellipse 80% 70% at 100% 0%, black, transparent 75%)',
          WebkitMaskImage:
            'radial-gradient(ellipse 80% 70% at 100% 0%, black, transparent 75%)',
        }}
      />
      {/* hover border brightens to rgba(255,255,255,0.18) on dark */}
      <span
        aria-hidden
        className="absolute inset-0 pointer-events-none opacity-0 transition-opacity duration-[var(--dur-fast)] group-hover:opacity-100"
        style={{
          borderRadius: 14,
          border: `1px solid ${onDark ? 'rgba(255,255,255,0.18)' : 'rgba(10,10,11,0.18)'}`,
        }}
      />

      {topRight && (
        <div className="absolute top-4 end-4 z-10">{topRight}</div>
      )}

      {/* visual ~60% of card height */}
      <div className="relative flex-1 min-h-0 flex items-center justify-center p-6">
        {visual}
      </div>

      {/* footer: bracket label + title + arrow */}
      <div className="relative p-6 pt-4 flex items-end justify-between gap-4">
        <div className="min-w-0 flex-1 space-y-2">
          <BracketTag variant={tagVariant} onDark={onDark}>
            {tag}
          </BracketTag>
          <div
            className={cn(
              'font-sans font-bold uppercase tracking-[-0.02em] leading-[1.05] text-[clamp(20px,2.2vw,28px)]',
              onDark ? 'text-[var(--ink-0)]' : 'text-[var(--ink-inv-0)]',
            )}
          >
            {title}
          </div>
        </div>
        <span
          aria-hidden
          className="shrink-0 inline-flex items-center justify-center w-9 h-9 rounded-full transition-transform duration-[var(--dur-fast)] group-hover:translate-x-1"
          style={{
            background: onDark ? 'rgba(255,255,255,0.06)' : 'rgba(10,10,11,0.05)',
            color: onDark ? 'var(--ink-1)' : 'var(--ink-inv-0)',
          }}
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
            <path
              d="M3 8h10M9 4l4 4-4 4"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
      </div>
    </motion.div>
  );

  if (!href) return body;
  return (
    <Link href={href} className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 rounded-[14px]">
      {body}
    </Link>
  );
}
