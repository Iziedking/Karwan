'use client';
import { motion } from 'motion/react';
import type { ReactNode } from 'react';
import { cn } from '@/shared/utils/cn';
import { dur, ease, sectionReveal } from '@/shared/motion/tokens';

/// SKILL.md §2.3 — section primitive enforcing the 96–160px desktop vertical
/// rhythm and the 12-column grid with 1320px content cap. Reveals on scroll
/// per §3 motion rule 2: opacity 0→1, y 24→0, dur.slow, ease.out, 15%
/// viewport threshold, fires once.

export function Section({
  tone = 'dark',
  children,
  className,
  id,
  compact = false,
}: {
  tone?: 'dark' | 'light';
  children: ReactNode;
  className?: string;
  id?: string;
  compact?: boolean;
}) {
  return (
    <motion.section
      id={id}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, amount: 0.15 }}
      variants={sectionReveal}
      transition={{ duration: dur.slow, ease: ease.out }}
      className={cn(
        'relative w-full overflow-hidden',
        className,
      )}
      style={{
        background: tone === 'dark' ? 'var(--surface-0)' : 'var(--paper-0)',
        color: tone === 'dark' ? 'var(--ink-1)' : 'var(--ink-inv-0)',
        paddingTop: compact ? 'clamp(56px, 7vw, 96px)' : 'clamp(96px, 11vw, 160px)',
        paddingBottom: compact ? 'clamp(56px, 7vw, 96px)' : 'clamp(96px, 11vw, 160px)',
      }}
    >
      <div
        className="relative mx-auto"
        style={{
          maxWidth: 1320,
          paddingLeft: 'clamp(20px, 4vw, 56px)',
          paddingRight: 'clamp(20px, 4vw, 56px)',
        }}
      >
        {children}
      </div>
    </motion.section>
  );
}

/// Faint grid background overlay for hero / editorial sections (skill §5.5 calls
/// for a "faint grid" pattern). Drop inside <Section> before content.
export function SectionGrid({ tone = 'dark' }: { tone?: 'dark' | 'light' }) {
  const line = tone === 'dark' ? 'rgba(255,255,255,0.04)' : 'rgba(10,10,11,0.04)';
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 opacity-80"
      style={{
        backgroundImage: `linear-gradient(${line} 1px, transparent 1px), linear-gradient(90deg, ${line} 1px, transparent 1px)`,
        backgroundSize: '80px 80px',
        maskImage: 'radial-gradient(ellipse 90% 80% at 100% 0%, black, transparent 70%)',
        WebkitMaskImage: 'radial-gradient(ellipse 90% 80% at 100% 0%, black, transparent 70%)',
      }}
    />
  );
}
