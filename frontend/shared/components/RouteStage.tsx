'use client';

import { motion, useReducedMotion } from 'motion/react';
import type { ReactNode } from 'react';
import { dur, ease } from '@/shared/motion/tokens';

/**
 * Keeps routine navigation visible while giving the route change a clear
 * beginning and end. The progress rule signals work; the small entrance keeps
 * the new page spatially connected to the previous one.
 */
export function RouteStage({ pathname, children }: { pathname: string; children: ReactNode }) {
  const reduce = useReducedMotion();

  return (
    <motion.div
      key={pathname}
      initial={reduce ? { opacity: 1 } : { opacity: 0.86, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: reduce ? 0 : dur.fast, ease: ease.out }}
      className="min-w-0"
    >
      {!reduce ? (
        <motion.span
          aria-hidden
          className="pointer-events-none fixed inset-x-0 top-0 z-[75] h-0.5 origin-left bg-[var(--accent)]"
          initial={{ opacity: 1, scaleX: 0 }}
          animate={{ opacity: [1, 1, 0], scaleX: [0, 0.76, 1] }}
          transition={{ duration: dur.base, ease: ease.out, times: [0, 0.72, 1] }}
        />
      ) : null}
      {children}
    </motion.div>
  );
}
