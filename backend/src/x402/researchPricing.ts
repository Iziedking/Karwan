import { z } from 'zod';

/// What a person's agent pays Karwan for outside research on Arc Testnet
/// (owner, 3 Nov 2026). An angle is one paid web search; one that another
/// agent already paid for is served from the cache at a lower price.
export const RESEARCH_PRICE = { freshAngleUsdc: 0.007, cachedAngleUsdc: 0.002 } as const;

export const researchFocusSchema = z.enum(['price', 'demand', 'suppliers', 'negotiation', 'full']);
export type ResearchFocus = z.infer<typeof researchFocusSchema>;
export type ResearchAngle = 'pricing' | 'marketplace-rates' | 'demand' | 'landscape';

/// The angles a question needs, so the person pays for what they asked. The
/// agents' own negotiation research needs price and demand, never suppliers.
const ANGLES: Record<ResearchFocus, ResearchAngle[]> = {
  price: ['pricing', 'marketplace-rates'],
  demand: ['demand'],
  suppliers: ['landscape'],
  negotiation: ['pricing', 'marketplace-rates', 'demand'],
  full: ['pricing', 'marketplace-rates', 'demand', 'landscape'],
};

export function anglesFor(focus: ResearchFocus): ResearchAngle[] {
  return [...ANGLES[focus]];
}

export interface ResearchQuote {
  focus: ResearchFocus;
  angles: ResearchAngle[];
  fresh: number;
  cached: number;
  totalUsdc: number;
}

export function quoteResearch(focus: ResearchFocus, cachedAngles: ReadonlySet<string>): ResearchQuote {
  const angles = anglesFor(focus);
  const cached = angles.filter((a) => cachedAngles.has(a)).length;
  const fresh = angles.length - cached;
  const totalUsdc = Math.round((fresh * RESEARCH_PRICE.freshAngleUsdc + cached * RESEARCH_PRICE.cachedAngleUsdc) * 1e6) / 1e6;
  return { focus, angles, fresh, cached, totalUsdc };
}
