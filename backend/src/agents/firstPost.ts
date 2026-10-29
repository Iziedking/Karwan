import type { BriefAnswers } from './agentBriefLines.js';

/// What a person is offered to post once setup is saved, on the web and in
/// Telegram alike. The hand-off is said to the assistant, which shows the
/// listing or request card; nothing posts until that card is confirmed.
export type FirstPost = { kind: 'offer' | 'request'; handOff: string };

export function firstPost(a: BriefAnswers): FirstPost | null {
  if ((a.goals.includes('work') || a.goals.includes('sell')) && a.what) {
    return { kind: 'offer', handOff: `I sell: ${a.what}.${a.price ? ` Usually ${a.price}.` : ''} Post this as my offer.` };
  }
  if (a.goals.includes('buy') && a.buy) return { kind: 'request', handOff: `I need: ${a.buy}. Post this as my request.` };
  return null;
}
