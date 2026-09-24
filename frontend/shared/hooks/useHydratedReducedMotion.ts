'use client';
import { useEffect, useState } from 'react';
import { useReducedMotion } from 'motion/react';

/// motion's useReducedMotion reads the media query during the first client
/// render, which the server cannot see. Markup that branched on it hydrated
/// into a different tree, and React threw #418 on every page for anyone with
/// reduced motion turned on. This reports false through hydration and the real
/// preference once mounted. The animations themselves are already reduced from
/// the first frame by <MotionConfig reducedMotion="user"> in AppProviders.
export function useHydratedReducedMotion(): boolean {
  const reduce = useReducedMotion();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted && reduce === true;
}
