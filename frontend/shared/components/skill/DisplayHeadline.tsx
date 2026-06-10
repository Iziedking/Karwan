'use client';
import { motion } from 'motion/react';
import type { ReactNode } from 'react';
import { cn } from '@/shared/utils/cn';
import { ease, dur, wordReveal } from '@/shared/motion/tokens';

/// SKILL.md §4.2. The display title. Three sizes per the skill's scale:
///   - xl: hero only (display-xl, clamp 56→128)
///   - lg: page H1 (display-lg, clamp 40→80)
///   - md: section heads / card titles in feature grids (display-md, clamp 28→44)
///
/// First-paint stagger per §3 motion rule 1: hero titles split into clip-path
/// word reveals with 80ms stagger, dur.hero, ease.out. Pass `animate` to enable.
///
/// Signature element: the single lime period at the end of hero/page titles
/// (Shaga's tell). Use the <LimePunc/> child to apply it; SKILL.md §4.2 caps
/// at "once per page maximum".

export type HeadlineSize = 'xl' | 'lg' | 'md';

const SIZE_CLASSES: Record<HeadlineSize, string> = {
  xl: 'text-[clamp(56px,8vw,128px)] tracking-[-0.04em] leading-[0.92]',
  lg: 'text-[clamp(40px,5vw,80px)] tracking-[-0.035em] leading-[0.95]',
  md: 'text-[clamp(28px,3vw,44px)] tracking-[-0.03em] leading-[1.0]',
};

export function DisplayHeadline({
  children,
  size = 'lg',
  className,
  onDark = true,
  animate = false,
  as: Tag = 'h1',
}: {
  children: ReactNode;
  size?: HeadlineSize;
  className?: string;
  onDark?: boolean;
  /// When true, wraps children in motion that reveals on viewport entry.
  /// For word-by-word reveal, use <SplitText/> as the child instead.
  animate?: boolean;
  as?: 'h1' | 'h2' | 'h3';
}) {
  const base = cn(
    'font-sans font-bold uppercase text-balance',
    SIZE_CLASSES[size],
    onDark ? 'text-[var(--ink-0)]' : 'text-[var(--ink-inv-0)]',
    className,
  );
  if (!animate) return <Tag className={base}>{children}</Tag>;
  return (
    <motion.div
      className={base}
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.4 }}
      transition={{ duration: dur.hero, ease: ease.out }}
    >
      <Tag className="contents">{children}</Tag>
    </motion.div>
  );
}

/// The single lime period that ends hero/page titles. Per SKILL.md §4.2 use
/// "once per page maximum". Render as `<LimePunc>.</LimePunc>` inline at the
/// end of the headline.
export function LimePunc({ children = '.' }: { children?: ReactNode }) {
  return <span style={{ color: 'var(--accent)' }}>{children}</span>;
}

/// Word-by-word reveal per SKILL.md §3 motion rule 1. Pass the plain string;
/// each word animates in with 80ms stagger and the dur.hero curve. Treat
/// it as a drop-in replacement for the children of <DisplayHeadline animate>.
export function SplitText({ text }: { text: string }) {
  const words = text.split(' ');
  return (
    <span
      className="inline-flex flex-wrap gap-x-[0.25em]"
      aria-label={text}
    >
      {words.map((word, i) => (
        <span key={i} className="inline-block overflow-hidden" aria-hidden>
          <motion.span
            className="inline-block"
            variants={wordReveal}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, amount: 0.5 }}
            transition={{ duration: dur.hero, ease: ease.out, delay: i * 0.08 }}
          >
            {word}
          </motion.span>
        </span>
      ))}
    </span>
  );
}
