const uiEase = [0.22, 1, 0.36, 1] as const;

export const ease = { out: uiEase, in: uiEase, inOut: uiEase } as const;
export const dur = {
  micro: 0.2,
  fast: 0.2,
  sheet: 0.4,
  base: 0.4,
  slow: 0.4,
  hero: 0.4,
  reduced: 0,
} as const;

export const spring = {
  drawer: { type: 'tween', ease: uiEase, duration: dur.sheet },
  thumb: { type: 'tween', ease: uiEase, duration: dur.fast },
} as const;

export const sectionReveal = {
  hidden: { opacity: 0, y: 24 },
  visible: { opacity: 1, y: 0 },
} as const;

export const staggerChildren = {
  visible: { transition: { staggerChildren: 0.06, delayChildren: 0.04 } },
} as const;

export const wordReveal = {
  hidden: { opacity: 0, y: '110%' },
  visible: { opacity: 1, y: '0%' },
} as const;
