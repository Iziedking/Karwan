/// The looping clips behind the six kinds of trade on the landing (view 49).
/// Each is a 7 second seamless loop with no sound, in two sizes and a poster.
/// They show kinds of trade, never customers: see public/media/landing/trades/SOURCES.md.

export type TradeClipKey = 'tailor' | 'market' | 'developer' | 'designer' | 'seller' | 'finance';

export interface TradeClip {
  key: TradeClipKey;
  pexelsId: string;
  portrait: boolean;
}

export const TRADE_CLIPS: readonly TradeClip[] = [
  { key: 'tailor', pexelsId: '37409118', portrait: false },
  { key: 'market', pexelsId: '27165158', portrait: false },
  { key: 'developer', pexelsId: '10374898', portrait: true },
  { key: 'designer', pexelsId: '6897954', portrait: false },
  { key: 'seller', pexelsId: '9464867', portrait: false },
  { key: 'finance', pexelsId: '15187012', portrait: false },
];

/// Bytes each file may weigh, so a phone never pulls a heavy clip.
export const CLIP_CAPS = { large: 1_600_000, small: 700_000, poster: 120_000 } as const;

const BASE = '/media/landing/trades';

export function clipFiles(key: TradeClipKey): { large: string; small: string; poster: string } {
  return {
    large: `${BASE}/${key}-1080.mp4`,
    small: `${BASE}/${key}-720.mp4`,
    poster: `${BASE}/${key}-poster.webp`,
  };
}
