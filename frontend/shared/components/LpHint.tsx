'use client';
import type { ReactNode } from 'react';
import { Hint } from './Hint';

/// The older dark info bubble now opens the same soft green note as [[Hint]],
/// closed with Got it, so every note in the app looks and behaves the same
/// (owner, 9 Nov 2026).
export function LpHint({
  children,
  side = 'top',
  align = 'start',
}: {
  children: ReactNode;
  side?: 'top' | 'bottom';
  align?: 'start' | 'center' | 'end';
}) {
  return (
    <Hint side={side} align={align}>
      {children}
    </Hint>
  );
}
