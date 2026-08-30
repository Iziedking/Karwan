'use client';

import { motion, useReducedMotion } from 'motion/react';
import { cn } from '@/shared/utils/cn';

/** A single restrained entrance cue for user-owned work. It never loops. */
export function ActionBeacon({ className }: { className?: string }) {
  const reduced = useReducedMotion();

  return (
    <span aria-hidden className={cn('relative inline-flex size-3 shrink-0 items-center justify-center', className)}>
      {!reduced ? (
        <motion.span
          className="absolute size-2 rounded-full bg-[var(--lp-accent)]"
          initial={{ opacity: 0.34, scale: 0.7 }}
          animate={{ opacity: 0, scale: 2.1 }}
          transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
        />
      ) : null}
      <motion.span
        className="relative size-1.5 rounded-full bg-[var(--lp-accent)]"
        initial={reduced ? false : { opacity: 0, scale: 0.5 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: reduced ? 0 : 0.24, ease: [0.16, 1, 0.3, 1] }}
      />
    </span>
  );
}
