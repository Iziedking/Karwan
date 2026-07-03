/**
 * Agentic-decision eval harness (audit/AGENTIC_WORKFLOW_REVIEW.md, Session 1).
 *
 * The point of the review's fixes is that live, paid market intelligence must
 * actually REACH the decision. This harness makes that measurable: it renders
 * the exact prompts the LLM sees and captures the deterministic pricing/anomaly
 * outputs for a fixed set of scenarios, then writes them to a fixture JSON.
 *
 * Record a BASELINE before changing behavior, then record again with the new
 * flags on and DIFF. The diff shows, concretely:
 *   - whether fairPriceUsdc / priceConfidence / researchSummary / market heat
 *     now appear in the bid-ranking and counter prompts (they were absent), and
 *   - that the flags-OFF path is byte-for-byte unchanged (no regression).
 *
 * Usage (dev only — tsx/src, never in the prod container):
 *   npm run eval:agentic -- record baseline
 *   npm run eval:agentic -- record after-on
 *   npm run eval:agentic -- compare baseline after-on
 *
 * It calls only pure, exported functions — no network, no DB, no LLM, no chain.
 */
import { writeFileSync, readFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  buildBidRankingPrompt,
  buildBidEvaluationPrompt,
  buildCounterEvaluationPrompt,
  type JobContext,
  type BidContext,
  type NegotiationContext,
  type CounterPartyConstraints,
} from '../llm/prompts.js';
import type { BuyerProfile } from '../agents/buyer-profile.js';
import type { SellerProfile } from '../agents/seller-profile.js';
import { classifyVsMarket, researchHeatFromRead } from '../agents/marketDemand.js';
import { recordPriceObservation, priceAnomalyScore, priceHistorySnapshot } from '../agents/signals.js';

const EVAL_DIR = join(process.cwd(), 'data', 'eval');

// Fixed "now" is not available (we want stable day-counts across runs), so we
// express deadlines as unix = fixedNow + N days and let daysFromNow yield N.
const DAY = 86_400;
const now = Math.floor(Date.now() / 1000);
const inDays = (n: number) => now + n * DAY;

// --- Fixed profiles (only the fields the prompts read are filled) ------------
const buyer = {
  maxBudgetUsdc: 1500,
  minDeadlineDays: 3,
  maxDeadlineDays: 30,
} as BuyerProfile;

const seller = {
  skills: ['solidity', 'smart contracts', 'foundry'],
  bio: 'Senior smart-contract engineer. Audited DeFi protocols.',
  minBudgetUsdc: 800,
  maxBudgetUsdc: 2000,
  minDeadlineDays: 5,
  maxDeadlineDays: 21,
} as SellerProfile;

// --- Sample market reads (the paid Exa read, distilled) ----------------------
// Each is the raw material the review says must reach the decision. Before the
// fix, none of these values appear in the rendered prompts.
const SAMPLE_READS = [
  { demand: 'hot' as const, priceConfidence: 'grounded' as const, sources: 4, fairPriceUsdc: 1400, summary: 'Solidity audit demand is elevated; senior rates $1200-1600 for a scoped engagement.' },
  { demand: 'hot' as const, priceConfidence: 'rough' as const, sources: 1, fairPriceUsdc: undefined, summary: 'Thin evidence; a single blog post suggests strong demand.' },
  { demand: 'steady' as const, priceConfidence: 'grounded' as const, sources: 3, fairPriceUsdc: 1100, summary: 'Market is balanced; typical scoped audits land near $1000-1200.' },
  { demand: 'soft' as const, priceConfidence: 'grounded' as const, sources: 4, fairPriceUsdc: 900, summary: 'Oversupply of generalist solidity devs; buyers hold near budget.' },
  { demand: 'soft' as const, priceConfidence: 'none' as const, sources: 0, fairPriceUsdc: undefined, summary: 'No usable pricing evidence found.' },
];

function scenarioJob(overrides: Partial<JobContext> = {}): JobContext {
  return {
    jobId: '0xEVAL',
    buyer: '0xBuyerEval',
    budgetUsdc: '1000',
    deadlineUnix: inDays(14),
    termsHash: '0xterms',
    buyerReputationBps: 5000,
    negotiationMaxIncreasePct: 40,
    briefText: 'Build and test an escrow contract with milestone releases.',
    keywords: ['solidity', 'escrow', 'smart contracts'],
    ...overrides,
  };
}

function scenarioBid(overrides: Partial<BidContext> = {}): BidContext {
  return {
    seller: '0xSellerEval',
    priceUsdc: '1000',
    deadlineUnix: inDays(12),
    sellerReputationBps: 7200,
    repTier: 'established',
    completionRate: 0.92,
    velocity24h: 3,
    priceMultiple: 1.0,
    priceAnomaly: 0.2,
    priorCleanDeals: 0,
    ...overrides,
  };
}

// --- Capture ------------------------------------------------------------------
type Fixture = {
  label: string;
  bidRankingPrompts: Record<string, string>;
  counterPrompts: Record<string, string>;
  bidEvaluationPrompt: string;
  heatMapping: Record<string, number>;
  marketClassify: Record<string, unknown>;
  priceRing: { snapshot: unknown; anomalies: Record<string, number | null> };
};

function capture(label: string): Fixture {
  // 1. Bid-ranking prompts across bid postures. The market fields (once wired)
  //    ride on BidContext, so these render strings are where the fix shows up.
  const bidRankingPrompts: Record<string, string> = {
    // Grounded read present -> fair-price anchor + heat should render.
    atBudgetEstablished: buildBidRankingPrompt(
      scenarioJob(),
      scenarioBid({
        fairPriceUsdc: 1100,
        priceConfidence: 'grounded',
        researchSummary: 'Scoped escrow audits land near $1000-1200 for senior devs.',
        marketHeatContinuous: 0.72,
      }),
      buyer,
    ),
    // Summary but no grounded price -> context-only line, no anchor.
    aboveBudgetCold: buildBidRankingPrompt(
      scenarioJob(),
      scenarioBid({
        priceUsdc: '1400',
        repTier: 'cold',
        sellerReputationBps: 3200,
        priceMultiple: 1.4,
        researchSummary: 'Thin evidence; a single post suggests elevated demand.',
        marketHeatContinuous: 0.58,
      }),
      buyer,
    ),
    // No read landed -> ranks on on-platform signals (baseline-equivalent path).
    belowBudgetNew: buildBidRankingPrompt(
      scenarioJob(),
      scenarioBid({ priceUsdc: '700', repTier: 'new', sellerReputationBps: 5000, priceMultiple: 0.7 }),
      buyer,
    ),
  };

  // 2. Counter prompts (buyer + seller side). Market heat + median already ride
  //    on NegotiationContext; the fair-price anchor is what the fix adds.
  const buyerParty: CounterPartyConstraints = {
    side: 'buyer',
    minAcceptablePriceUsdc: 1000,
    maxAcceptablePriceUsdc: 1400,
    minDeadlineDays: 3,
    maxDeadlineDays: 30,
  };
  const sellerParty: CounterPartyConstraints = {
    side: 'seller',
    minAcceptablePriceUsdc: 900,
    maxAcceptablePriceUsdc: 2000,
    minDeadlineDays: 5,
    maxDeadlineDays: 21,
  };
  const baseCtx: NegotiationContext = {
    round: 0,
    maxRounds: 3,
    counterpartyTier: 'established',
    suggestedCounterPrice: 1100,
    marketMedianPrice: 1150,
    marketSampleCount: 12,
    marketHeat: researchHeatFromRead({ demand: 'hot', priceConfidence: 'grounded', sources: [{ title: 'a', url: 'x' }, { title: 'b', url: 'y' }, { title: 'c', url: 'z' }, { title: 'd', url: 'w' }] }),
    trustedMatch: false,
    fairPriceUsdc: 1150,
    priceConfidence: 'grounded',
    researchSummary: 'Senior escrow-audit rates cluster around $1100-1200 this quarter.',
  };
  const counterPrompts: Record<string, string> = {
    buyerRound0: buildCounterEvaluationPrompt(scenarioJob(), buyerParty, '1000', '1300', inDays(12), baseCtx),
    sellerRound1: buildCounterEvaluationPrompt(
      scenarioJob(),
      sellerParty,
      '1500',
      '1050',
      inDays(12),
      { ...baseCtx, round: 1, marketHeat: researchHeatFromRead({ demand: 'soft', priceConfidence: 'grounded', sources: [{ title: 'a', url: 'x' }, { title: 'b', url: 'y' }, { title: 'c', url: 'z' }, { title: 'd', url: 'w' }] }) },
    ),
  };

  const bidEvaluationPrompt = buildBidEvaluationPrompt(scenarioJob(), seller);

  // 3. Heat mapping: the review's headline complaint (#5) — the paid read is
  //    quantized to 3 constants. Capture the heat each sample read maps to.
  const heatMapping: Record<string, number> = {};
  for (const r of SAMPLE_READS) {
    const key = `${r.demand}/${r.priceConfidence}/src${r.sources}`;
    // Continuous, evidence-weighted heat. The baseline fixture recorded the old
    // quantizer's output under these same keys, so `compare baseline after-on`
    // shows the before/after on identical scenarios.
    heatMapping[key] = researchHeatFromRead({
      demand: r.demand,
      priceConfidence: r.priceConfidence,
      sources: Array.from({ length: r.sources }, (_, i) => ({ title: `s${i}`, url: `u${i}` })),
    });
  }

  // 4. Market classification (budget vs grounded price) — regression guard.
  const marketClassify: Record<string, unknown> = {};
  for (const r of SAMPLE_READS) {
    marketClassify[`${r.demand}/${r.priceConfidence}`] = classifyVsMarket(1500, r.fairPriceUsdc);
  }

  // 5. Price ring — regression guard for the global-ring fallback (B5 must not
  //    change this when no category data exists). Feed a fixed sample set.
  for (const p of [100, 110, 95, 105, 100, 120, 90, 115, 100, 108, 250]) recordPriceObservation(p);
  const priceRing = {
    snapshot: priceHistorySnapshot(),
    anomalies: {
      at100: priceAnomalyScore(100),
      at250: priceAnomalyScore(250),
      at50: priceAnomalyScore(50),
    } as Record<string, number | null>,
  };

  return { label, bidRankingPrompts, counterPrompts, bidEvaluationPrompt, heatMapping, marketClassify, priceRing };
}

// --- Diff ---------------------------------------------------------------------
function diff(a: Fixture, b: Fixture): string[] {
  const out: string[] = [];
  const walk = (path: string, x: unknown, y: unknown) => {
    if (typeof x === 'string' && typeof y === 'string') {
      if (x !== y) {
        const ax = x.split('\n');
        const by = y.split('\n');
        const added = by.filter((l) => !ax.includes(l));
        const removed = ax.filter((l) => !by.includes(l));
        out.push(`~ ${path}`);
        for (const l of removed) out.push(`   - ${l}`);
        for (const l of added) out.push(`   + ${l}`);
      }
      return;
    }
    if (JSON.stringify(x) !== JSON.stringify(y)) {
      if (x && y && typeof x === 'object' && typeof y === 'object') {
        const keys = new Set([...Object.keys(x as object), ...Object.keys(y as object)]);
        for (const k of keys) walk(`${path}.${k}`, (x as any)[k], (y as any)[k]);
      } else {
        out.push(`~ ${path}: ${JSON.stringify(x)} -> ${JSON.stringify(y)}`);
      }
    }
  };
  walk('', a, b);
  return out;
}

// --- Main ---------------------------------------------------------------------
function main() {
  const [mode, ...rest] = process.argv.slice(2);
  if (!existsSync(EVAL_DIR)) mkdirSync(EVAL_DIR, { recursive: true });

  if (mode === 'record') {
    const label = rest[0] ?? 'unlabeled';
    const fx = capture(label);
    const path = join(EVAL_DIR, `agentic-${label}.json`);
    writeFileSync(path, JSON.stringify(fx, null, 2));
    // A quick, human-readable summary of what reached the decision.
    const marketHits = Object.values(fx.bidRankingPrompts).filter((p) =>
      /fair.?price|market read|market demand/i.test(p),
    ).length;
    console.log(`recorded ${path}`);
    console.log(`  bid-ranking prompts containing market intel: ${marketHits}/${Object.keys(fx.bidRankingPrompts).length}`);
    console.log(`  heat mapping (sample read -> heat):`);
    for (const [k, v] of Object.entries(fx.heatMapping)) console.log(`    ${k} -> ${v}`);
    return;
  }

  if (mode === 'compare') {
    const [aLabel, bLabel] = rest;
    if (!aLabel || !bLabel) {
      console.error('usage: compare <a-label> <b-label>');
      process.exit(1);
    }
    const a = JSON.parse(readFileSync(join(EVAL_DIR, `agentic-${aLabel}.json`), 'utf8')) as Fixture;
    const b = JSON.parse(readFileSync(join(EVAL_DIR, `agentic-${bLabel}.json`), 'utf8')) as Fixture;
    const d = diff(a, b);
    if (d.length === 0) {
      console.log(`no differences between ${aLabel} and ${bLabel}`);
    } else {
      console.log(`diff ${aLabel} -> ${bLabel} (${d.length} lines):\n`);
      console.log(d.join('\n'));
    }
    return;
  }

  console.error('usage: eval-agentic (record <label> | compare <a> <b>)');
  process.exit(1);
}

main();
