const uiEase = [0.2, 0, 0, 1] as const;

export const ease = { out: uiEase, in: uiEase, inOut: uiEase } as const;
export const dur = {
  press: 0.12,
  micro: 0.18,
  fast: 0.18,
  push: 0.35,
  sheet: 0.35,
  base: 0.35,
  slow: 0.35,
  hero: 0.35,
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
