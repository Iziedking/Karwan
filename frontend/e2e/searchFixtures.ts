import type { Page, Route } from '@playwright/test';
import { API, BUYER_AGENT, ME, SELLER_AGENT, serveMoney, type MoneyWorld } from './moneyFixtures';

export const JOB = `0x${'cd'.repeat(32)}`;

export interface SearchWorld extends MoneyWorld {
  activated?: boolean;
  profile?: Record<string, unknown> | null;
  quote?: { requiredUsdc: string; balanceUsdc: string; topUpNeededUsdc: string; activated: boolean };
  jobs?: unknown[];
  job?: Record<string, unknown>;
  proposal?: Record<string, unknown> | null;
  seller?: { activeBids: unknown[]; recentBids: unknown[] };
  matches?: unknown[];
  listings?: unknown[];
  activate?: (route: Route) => Promise<void>;
  postJob?: (route: Route) => Promise<void>;
  postListing?: (route: Route) => Promise<void>;
  abandon?: (route: Route) => Promise<void>;
}

export function makeJob(over: Record<string, unknown> = {}) {
  return {
    jobId: JOB,
    // The real API names the buyer AGENT here, never the user.
    buyer: BUYER_AGENT,
    budgetUsdc: '120',
    deadlineUnix: Math.floor(Date.now() / 1000) + 5 * 86_400,
    termsHash: 'h',
    finalized: false,
    escrowFunded: false,
    briefText: 'Logo for my bakery',
    bids: [],
    lastCounterPriceBySeller: {},
    counterRoundsBySeller: {},
    isParty: true,
    viewerIsBuyer: true,
    ...over,
  };
}

export function makeProposal(over: Record<string, unknown> = {}) {
  return {
    jobId: JOB,
    buyerUser: ME.toLowerCase(),
    buyerAgent: BUYER_AGENT,
    sellerUser: '0x5555555555555555555555555555555555555555',
    sellerAgent: '0x6666666666666666666666666666666666666666',
    agreedPriceUsdc: '96',
    deadlineUnix: Math.floor(Date.now() / 1000) + 5 * 86_400,
    termsHash: 'h',
    proposedAt: 1,
    ...over,
  };
}

const PROFILE = {
  address: ME,
  role: 'both',
  displayName: 'Me',
  createdAt: 1,
  updatedAt: 1,
  buyer: { maxBudgetUsdc: 1000, minDeadlineDays: 1, maxDeadlineDays: 30, milestonePcts: [100] },
  seller: { skills: ['design'], bio: '', minBudgetUsdc: 10, maxBudgetUsdc: 1000, minDeadlineDays: 1, maxDeadlineDays: 30 },
};

/// Search routes over the money fixture. Playwright runs the most recently
/// registered route first, so these answer before serveMoney's catch-all and
/// hand anything else back to it.
export async function serveSearch(page: Page, world: SearchWorld) {
  await serveMoney(page, world);
  let activated = world.activated !== false;
  await page.route(`${API}/**`, async (route) => {
    const path = new URL(route.request().url()).pathname;
    const method = route.request().method();
    if (path === '/api/activation/status') {
      return route.fulfill({
        json: activated ? { activated: true, agents: { buyer: BUYER_AGENT, seller: SELLER_AGENT } } : { activated: false },
      });
    }
    if (path === '/api/activation/activate' && method === 'POST') {
      if (world.activate) return world.activate(route);
      activated = true;
      return route.fulfill({ json: { activated: true, agents: { buyer: BUYER_AGENT, seller: SELLER_AGENT } } });
    }
    if (path === '/api/agents/status') return route.fulfill({ json: { chain: { id: 5042002, rpc: 'http://127.0.0.1:3198', explorer: 'https://testnet.arcscan.app' }, contracts: {} } });
    if (path === '/api/profile') return route.fulfill({ json: { profile: world.profile === undefined ? PROFILE : world.profile } });
    if (path === '/api/jobs/funding-quote') {
      return route.fulfill({ json: world.quote ?? { requiredUsdc: '122', balanceUsdc: '500', topUpNeededUsdc: '0', activated: true } });
    }
    if (path === '/api/agents/buyer') return route.fulfill({ json: { profile: null, jobs: world.jobs ?? [] } });
    if (path === '/api/jobs' && method === 'POST' && world.postJob) return world.postJob(route);
    if (path === '/api/listings' && method === 'POST' && world.postListing) return world.postListing(route);
    if (path === '/api/agents/seller/bids/abandon' && world.abandon) return world.abandon(route);
    if (path === '/api/agents/seller') {
      return route.fulfill({ json: { profile: null, ...(world.seller ?? { activeBids: [], recentBids: [] }) } });
    }
    if (path === '/api/jobs/matches/for') return route.fulfill({ json: { proposals: world.matches ?? [] } });
    if (path === '/api/listings/mine') return route.fulfill({ json: { listings: world.listings ?? [] } });
    if (path === `/api/jobs/${JOB}/match`) return route.fulfill({ json: { proposal: world.proposal ?? null } });
    if (path === `/api/jobs/${JOB}/near-miss`) return route.fulfill({ json: { nearMiss: null } });
    if (path === `/api/jobs/${JOB}`) return route.fulfill({ json: world.job ?? makeJob() });
    return route.fallback();
  });
}
