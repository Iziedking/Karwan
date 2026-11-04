/// The hero's five drawn states (Figma 108:570 to 111:692), read from the
/// pinned scene's progress. The phone's turn itself is CSS, driven by --p;
/// these decide what is written on it.

/// Progress where each state starts: turning away, the back, the terms, the
/// seller reviews, both agreed. The turn runs across the first three.
const STARTS = [0.08, 0.25, 0.42, 0.58, 0.8] as const;

export type HeroStage = 0 | 1 | 2 | 3 | 4 | 5;

export function heroStage(progress: number): HeroStage {
  let stage = 0;
  for (const start of STARTS) if (progress >= start) stage += 1;
  return stage as HeroStage;
}

export interface HeroView {
  copy: 'hero' | 'terms' | 'agree';
  screen: 'chat' | 'terms' | 'review';
  sellerPhone: boolean;
  sellerAgreed: boolean;
}

export function heroView(stage: HeroStage): HeroView {
  return {
    copy: stage === 0 ? 'hero' : stage < 4 ? 'terms' : 'agree',
    // Stage 2 is the back of the phone: the front changes then, out of sight.
    screen: stage < 2 ? 'chat' : stage < 4 ? 'terms' : 'review',
    sellerPhone: stage >= 4,
    sellerAgreed: stage >= 5,
  };
}
