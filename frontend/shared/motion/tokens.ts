/// Motion tokens per docs/SKILL.md §3. The values here MUST stay 1:1 with the
/// `--ease-*` and `--dur-*` CSS variables in globals.css so JS-driven motion
/// (Framer Motion / motion) matches CSS-driven motion exactly.
///
/// Every UI animation in Karwan uses one of these tokens. No bespoke values.

export const ease = {
  out: [0.16, 1, 0.3, 1] as const,        // ui affordance, default for reveals
  in: [0.7, 0, 0.84, 0] as const,         // dismissals
  inOut: [0.83, 0, 0.17, 1] as const,     // layout shifts
} as const;

export const dur = {
  micro: 0.18,   // hover, focus, color
  fast: 0.24,    // button press, chip select
  base: 0.36,    // accordion, drawer
  slow: 0.56,    // page section reveal
  hero: 0.9,     // hero entrance, staggered
} as const;

export const spring = {
  drawer: { type: 'spring', stiffness: 320, damping: 32, mass: 0.7 } as const,
  thumb: { type: 'spring', stiffness: 420, damping: 28, mass: 0.5 } as const,
} as const;

/// SKILL.md §3 motion rule 2: section reveal on scroll. Use as the variants
/// prop on a top-level <motion.section>; trigger with viewport={{ once: true,
/// amount: 0.15 }} so it fires at 15% in-view.
export const sectionReveal = {
  hidden: { opacity: 0, y: 24 },
  visible: { opacity: 1, y: 0 },
} as const;

/// Stagger children when the parent enters. 60ms per child as per the skill.
export const staggerChildren = {
  visible: {
    transition: { staggerChildren: 0.06, delayChildren: 0.04 },
  },
} as const;

/// Word-by-word hero reveal. Apply to each <span> wrapping a word.
export const wordReveal = {
  hidden: { opacity: 0, y: '110%' },
  visible: { opacity: 1, y: '0%' },
} as const;
