import type { GuideSetting } from './guideChoices';

/// When Aman may move or say its line (view 57). It keeps still while a person
/// types, scrolls fast, reads a dialog or moves money, and says one line a page.

export const FAST_SCROLL = 1200;

export interface MoveState { typing: boolean; fastScroll: boolean; dialogOpen: boolean; moneyFlow: boolean; reducedMotion: boolean }

export interface SpeakState {
  typing: boolean;
  dialogOpen: boolean;
  moneyFlow: boolean;
  spokenThisVisit: boolean;
  quietHere: boolean;
  guide: GuideSetting;
}

export function mayMove(s: MoveState): boolean {
  return !(s.typing || s.fastScroll || s.dialogOpen || s.moneyFlow || s.reducedMotion);
}

export function maySpeak(s: SpeakState): boolean {
  return s.guide === 'on' && !(s.typing || s.dialogOpen || s.moneyFlow || s.spokenThisVisit || s.quietHere);
}

const MONEY_FLOWS = /^\/(?:send|withdraw|add|cashout)(?:\/|$)/;

export function isMoneyFlow(pathname: string): boolean {
  return MONEY_FLOWS.test(pathname);
}

/// A blink every 4 to 7 seconds, the same sequence for the same page visit.
export function blinkDelay(seed: number, n: number): number {
  let h = (Math.imul(seed | 0, 0x9e3779b1) ^ Math.imul((n + 1) | 0, 0x85ebca6b)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x7feb352d) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x846ca68b) >>> 0;
  h = (h ^ (h >>> 16)) >>> 0;
  return 4000 + (h % 3001);
}
