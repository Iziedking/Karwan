/// Stage 0 + 1 of the chat-native transaction surface: the AUTHENTICATED
/// assistant. When a signed-in user chats, the assistant runs a tool-calling
/// loop that can read THEIR OWN data (wallet balance, their deals, a deal's
/// status, a plain explanation of an error they hit) and answer from real
/// numbers instead of guessing. It is READ-ONLY: no tool moves money, funds,
/// releases, cancels, or changes anything. Money-moving actions are a later,
/// confirm-gated stage.
///
/// PRIVACY: every tool is bound to the caller's cryptographically-verified
/// session address (passed in by the route, never a client param) and reads only
/// that address's data. get_deal_status additionally enforces deal party
/// membership, so a jobId the user isn't part of returns an error, not data. The
/// loop runs on `assistantAgentModel` (direct Anthropic ONLY, no Conduit /
/// OpenRouter) because the prompt + tool results carry private account data. When
/// that model is absent the caller falls back to the anonymous, knowledge-only
/// provider chain, which never sees private data — never to a proxy for this input.

import { generateText, tool, stepCountIs } from 'ai';
import { z } from 'zod';
import { formatUnits, parseUnits, type Address } from 'viem';
import { assistantAgentModel } from '../llm/client.js';
import { withLlmTimeout } from '../agents/llm-utils.js';
import { KARWAN_ASSISTANT_SYSTEM } from './knowledge.js';
import { readUsdcBalance, readEscrow } from '../chain/contracts.js';
import { arcTestnet, publicClient } from '../chain/client.js';
import { listDealsForAddress, getDeal, type DirectDeal } from '../db/deals.js';
import { getAgentWallets } from '../db/agentWallets.js';
import { listActivityForAddress } from '../db/activityLog.js';
import { listBridgesForWallets } from '../db/bridges.js';
import { listMatchProposalsForUser } from '../db/matchProposals.js';
import { activeStakeSummary } from '../reputation/stake.js';
import { readStakerYield } from '../routes/yield.js';
import { loadInputs } from '../reputation/signals.js';
import { compute as computeReputation } from '../reputation/engine.js';
import { listListingsForSeller, listingStatus } from '../db/listings.js';
import { getBuyerSnapshot } from '../agents/buyer.js';
import { getSellerSnapshot } from '../agents/seller.js';
import { listOffersBySeller, listOffersByFinancier } from '../db/factoring.js';
import { listLinesBySeller, listLinesByFinancier } from '../db/poFinancing.js';
import { getProfile } from '../db/profiles.js';
import { resolveSellerProfile, resolveBuyerProfileForUser } from '../agents/agent-registry.js';
import { readUserGatewayBalance } from '../gateway/balance.js';
import { diagnoseUserError } from '../llm/supervisor.js';
import {
  buildNavigateAction,
  buildPostOfferConfirm,
  buildPostRequestConfirm,
  buildReleaseConfirm,
  buildWithdrawConfirm,
  buildCashOutConfirm,
  buildGatewayDepositConfirm,
  buildGatewayFundAgentConfirm,
  buildGatewayCashOutConfirm,
  hasEquivalentConfirm,
  NAVIGATE_DESTINATIONS,
  type AssistantAction,
} from './actions.js';

/// Friendly chain names the model may pick for a cash-out, mapped to the CCTP
/// chain keys the bridge-out route expects. Testnet keys because Karwan is on Arc
/// Testnet. Kept to the well-supported set (mirrors CircleBridgeChainKey).
const CASH_OUT_CHAINS: Record<string, { key: string; label: string; solana?: boolean }> = {
  base: { key: 'baseSepolia', label: 'Base' },
  arbitrum: { key: 'arbitrumSepolia', label: 'Arbitrum' },
  optimism: { key: 'optimismSepolia', label: 'Optimism' },
  ethereum: { key: 'sepolia', label: 'Ethereum' },
  polygon: { key: 'polygonAmoy', label: 'Polygon' },
  // Solana Devnet: verified end-to-end via the bridge-out path (App Kit derives
  // the recipient ATA from the base58 owner). Only on cash_out (bridge-out), NOT
  // gateway_cash_out (Gateway spend to Solana is unproven).
  solana: { key: 'solanaDevnet', label: 'Solana', solana: true },
};
import { logger } from '../logger.js';

const USDC_DECIMALS = 6;
const NATIVE_DECIMALS = arcTestnet.nativeCurrency.decimals;

/// Whether the authenticated tool-calling assistant can run. False when no
/// Anthropic key is set (privacy boundary: this path is direct-Anthropic-only).
export function assistantAgentEnabled(): boolean {
  return assistantAgentModel !== null;
}

export type AssistantChatMessage = { role: 'user' | 'assistant'; content: string };

// --- deal shaping -----------------------------------------------------------

/// Party gate for a single deal: only the buyer or the seller may see it. The
/// viewer address must already be lowercased (the session address always is).
/// This is the privacy boundary for get_deal_status — a jobId the caller isn't
/// part of returns an error, never data.
export function canViewDeal(deal: Pick<DirectDeal, 'buyer' | 'seller'>, viewer: string): boolean {
  return deal.buyer === viewer || deal.seller === viewer;
}

/// A short, human phase for a deal, derived from its lifecycle fields in the same
/// priority order the deal page uses: terminal states first, then in-flight.
export function dealPhase(deal: DirectDeal): string {
  if (deal.cancelledAt) return `cancelled${deal.cancelKind ? ` (${deal.cancelKind})` : ''}`;
  if (deal.settledAt) return 'settled';
  if (deal.disputed) return 'in dispute';
  if (deal.delivered && !deal.settledAt) return 'delivered, awaiting your release';
  if (deal.pendingCounterparty) return 'waiting for the invited counterparty to join';
  if (!deal.acceptedAt) return 'waiting for the seller to accept';
  return 'in progress, awaiting delivery';
}

/// A compact, viewer-relative view of a deal. `role` and `counterparty` are from
/// the caller's side; amounts stay in USDC. Nothing internal (agent wallet ids,
/// tx hashes, other parties' private notes) is exposed.
export function summarizeDeal(deal: DirectDeal, viewer: string): Record<string, unknown> {
  const isBuyer = deal.buyer === viewer;
  return {
    jobId: deal.jobId,
    role: isBuyer ? 'buyer' : 'seller',
    counterparty: isBuyer ? deal.sellerPaytag ?? deal.seller : deal.buyer,
    amountUsdc: deal.dealAmountUsdc,
    phase: dealPhase(deal),
    deadline: deal.deadlineUnix ? new Date(deal.deadlineUnix * 1000).toISOString() : null,
    releasePaused: deal.releaseBlockedReason ?? null,
    // Dates make relative-time questions answerable ("the deal from last week").
    openedAt: new Date(deal.createdAt).toISOString(),
    settledAt: deal.settledAt ? new Date(deal.settledAt).toISOString() : null,
  };
}

// --- tools ------------------------------------------------------------------

/// Build the tool set bound to one caller. Read tools read only `address`'s own
/// data; `propose_navigation` pushes a validated navigate action into `actions`.
/// Tools return plain objects (including `{ error }`) rather than throwing, so the
/// model can explain a failure to the user instead of the loop aborting.
function buildTools(address: string, method: string, actions: AssistantAction[]) {
  return {
    get_my_balance: tool({
      description:
        "Read the signed-in user's full money picture on Arc testnet: their sign-in wallet (USDC + native gas), their buyer and seller agent wallets (USDC + address), and their unified balance if they have one. Use this whenever they ask what their balance is, where their money is, how much USDC they have, what their agent wallet addresses are, or whether they can afford something. Never guess a number.",
      inputSchema: z.object({}),
      execute: async () => {
        try {
          const [usdc, gas, record, unified, stake] = await Promise.all([
            readUsdcBalance(address),
            publicClient.getBalance({ address: address as Address }),
            getAgentWallets(address).catch(() => null),
            readUserGatewayBalance(address).catch(() => null),
            activeStakeSummary(address).catch(() => null),
          ]);
          const agentBal = async (addr?: string) =>
            addr ? formatUnits(await readUsdcBalance(addr), USDC_DECIMALS) : null;
          const [buyerUsdc, sellerUsdc] = await Promise.all([
            agentBal(record?.buyerAddress),
            agentBal(record?.sellerAddress),
          ]);
          return {
            wallet: {
              address,
              usdc: formatUnits(usdc, USDC_DECIMALS),
              gas: formatUnits(gas, NATIVE_DECIMALS),
            },
            buyerAgent: record?.buyerAddress
              ? { address: record.buyerAddress, usdc: buyerUsdc }
              : null,
            sellerAgent: record?.sellerAddress
              ? { address: record.sellerAddress, usdc: sellerUsdc }
              : null,
            unifiedBalance: unified ? unified.available.toFixed(2) : null,
            stakedUsdc: stake && stake.stakeUsdc > 0 ? stake.stakeUsdc.toFixed(2) : null,
            note: 'Agents trade from the agent wallets. Sale proceeds land in the seller agent; refunds in the buyer agent. The unified balance is a pooled USDC balance you can use to fund either agent. stakedUsdc is USDC locked in the stake vault (null when they have no stake) — use get_my_stake for the full staking picture including yield.',
          };
        } catch (err) {
          logger.warn({ err: (err as Error).message }, 'assistant get_my_balance failed');
          return { error: 'Could not read the balance from the chain right now. Try again shortly.' };
        }
      },
    }),

    list_my_deals: tool({
      description:
        "List the signed-in user's own deals (both the ones they buy and the ones they sell), most useful for 'what deals do I have', 'what's open', or 'show my trades'. Returns a compact list; use get_deal_status for the full picture of one deal.",
      inputSchema: z.object({}),
      execute: async () => {
        try {
          const deals = await listDealsForAddress(address);
          if (deals.length === 0) {
            return { deals: [], note: 'You have no deals yet.' };
          }
          return { count: deals.length, deals: deals.map((d) => summarizeDeal(d, address)) };
        } catch (err) {
          logger.warn({ err: (err as Error).message }, 'assistant list_my_deals failed');
          return { error: 'Could not load your deals right now. Try again shortly.' };
        }
      },
    }),

    get_deal_status: tool({
      description:
        "Get the full status of ONE of the signed-in user's own deals by its jobId: phase, amount, counterparty, deadline, and whether a release is paused. Only works for a deal the user is a party to.",
      inputSchema: z.object({
        jobId: z.string().min(1).max(120).describe('The deal id (jobId) to look up.'),
      }),
      execute: async ({ jobId }) => {
        try {
          const deal = await getDeal(jobId);
          if (!deal) return { error: `No deal found with id ${jobId}.` };
          // Party gate: the caller must be the buyer or the seller on this deal.
          if (!canViewDeal(deal, address)) {
            return { error: 'That deal is not one of yours, so I cannot show its details.' };
          }
          return { deal: summarizeDeal(deal, address) };
        } catch (err) {
          logger.warn({ err: (err as Error).message }, 'assistant get_deal_status failed');
          return { error: 'Could not read that deal right now. Try again shortly.' };
        }
      },
    }),

    recall_activity: tool({
      description:
        "Your durable memory of this account's past activity, surviving across chat sessions: money movements (withdrawals, agent top-ups, unified-balance deposits and spends, escrow releases, cash-outs), bridge transfers between chains (amount, chains, status, date), and agent match proposals (who their agent matched them with, at what price, and the outcome). Use it whenever the user refers to something that already happened or uses relative time — 'we bridged 20 USDC to Base two days ago', 'you matched me last week, who was the counterparty', 'when did I last withdraw'. Check this BEFORE ever saying you don't remember or have no record. For full deal detail follow up with get_deal_status.",
      inputSchema: z.object({
        days: z
          .number()
          .int()
          .min(1)
          .max(90)
          .default(30)
          .describe('How far back to look, in days. Default 30.'),
      }),
      execute: async ({ days }) => {
        const since = Date.now() - days * 86_400_000;
        const iso = (ts: number) => new Date(ts).toISOString();
        try {
          const [ledger, walletsRec, proposals] = await Promise.all([
            listActivityForAddress(address, since, 40),
            getAgentWallets(address).catch(() => null),
            listMatchProposalsForUser(address),
          ]);
          // Same address set the bridge-history page uses: the user's own
          // address (App Kit forwarder bridges) plus their source-chain DCWs.
          const bridgeAddrs = [
            address,
            ...Object.values(walletsRec?.bridgeWallets ?? {}).map((w) => w.address),
          ];
          const bridgeRows = (await listBridgesForWallets(bridgeAddrs))
            .filter((b) => b.createdAt >= since)
            .slice(0, 20);
          const moneyMoves = ledger.map((e) => ({
            at: iso(e.ts),
            kind: e.kind,
            summary: e.summary,
            ...(e.txHash ? { txHash: e.txHash } : {}),
            ...(e.refId ? { transferRef: e.refId } : {}),
            ...(e.jobId ? { jobId: e.jobId } : {}),
          }));
          const bridgeItems = bridgeRows.map((b) => ({
            at: iso(b.createdAt),
            kind: 'bridge',
            amountUsdc: b.amountUsdc,
            from: b.direction === 'out' ? 'arc' : (b.sourceChainKey ?? 'unknown'),
            to: b.direction === 'out' ? (b.destChainKey ?? 'unknown') : 'arc',
            status: b.status,
            ...(b.mintTxHash ? { mintTxHash: b.mintTxHash } : {}),
          }));
          const matchItems = proposals
            .filter((p) => p.proposedAt >= since)
            .slice(0, 15)
            .map((p) => {
              const isBuyer = p.buyerUser === address;
              return {
                at: iso(p.proposedAt),
                kind: 'match_proposal',
                jobId: p.jobId,
                yourRole: isBuyer ? 'buyer' : 'seller',
                counterparty: isBuyer ? p.sellerUser : p.buyerUser,
                priceUsdc: p.raisedPriceUsdc ?? p.agreedPriceUsdc,
                outcome: p.approvedAt
                  ? 'approved'
                  : p.declinedAt
                    ? 'declined'
                    : 'awaiting approval',
              };
            });
          return {
            lookedBackDays: days,
            moneyMoves,
            bridges: bridgeItems,
            matchProposals: matchItems,
            note:
              moneyMoves.length + bridgeItems.length + matchItems.length === 0
                ? `No recorded activity in the last ${days} days. Approved matches become deals, so also check list_my_deals (it carries openedAt dates).`
                : 'Times are UTC ISO. Chain keys are testnet keys (baseSepolia = Base, sepolia = Ethereum, arbitrumSepolia = Arbitrum, optimismSepolia = Optimism, polygonAmoy = Polygon, avalancheFuji = Avalanche, unichainSepolia = Unichain, solanaDevnet = Solana). Approved match proposals continue as deals under the same jobId.',
          };
        } catch (err) {
          logger.warn({ err: (err as Error).message }, 'assistant recall_activity failed');
          return { error: 'Could not read the account history right now. Try again shortly.' };
        }
      },
    }),

    get_my_stake: tool({
      description:
        "The signed-in user's full staking picture: total USDC staked in the vault, how much is free vs reserved as insurance against their open deals, how long they've been staking, plus their yield — claimable now, lifetime earned, lifetime claimed. Use for 'what is my staking balance', 'how much have I staked', 'what's my yield', 'can I unstake'. Never guess these numbers.",
      inputSchema: z.object({}),
      execute: async () => {
        try {
          const [stake, yieldSnap] = await Promise.all([
            activeStakeSummary(address),
            readStakerYield(address).catch(() => null),
          ]);
          return {
            stakedUsdc: stake.stakeUsdc.toFixed(2),
            freeStakeUsdc: stake.freeStakeUsdc.toFixed(2),
            reservedForDealsUsdc: stake.reservedUsdc.toFixed(2),
            longestPositionDays: Math.round(stake.stakeDays),
            yield:
              yieldSnap && yieldSnap.configured
                ? {
                    claimableNowUsdc: yieldSnap.claimableUsdc,
                    lifetimeEarnedUsdc: yieldSnap.lifetimeCreditedUsdc,
                    lifetimeClaimedUsdc: yieldSnap.lifetimeClaimedUsdc,
                  }
                : null,
            note: 'Free stake backs new deals as insurance; reserved stake is locked against open deals until they settle. Yield is credited daily from the USYC-backed treasury and claimed at /stake. Staking also feeds the reputation score.',
          };
        } catch (err) {
          logger.warn({ err: (err as Error).message }, 'assistant get_my_stake failed');
          return { error: 'Could not read the stake vault right now. Try again shortly.' };
        }
      },
    }),

    get_my_reputation: tool({
      description:
        "The signed-in user's reputation: score (0-1000), tier (NEW / COLD / ESTABLISHED / STRONG / ELITE), and the record behind it — deals completed, disputes, lifetime volume, stake, account age. Use for 'what is my reputation', 'why is my score low', 'how do I reach the next tier', or when they ask how counterparties see them.",
      inputSchema: z.object({}),
      execute: async () => {
        try {
          const inputs = await loadInputs(address);
          const result = computeReputation(inputs);
          return {
            score: result.score,
            tier: result.tier,
            record: {
              dealsCompleted: inputs.completedDeals,
              dealsStarted: inputs.totalStarted,
              disputes: inputs.disputedCount,
              failed: inputs.failedCount,
              cancelsLast90d: inputs.cancelsLast90d,
              lifetimeVolumeUsdc: inputs.lifetimeVolumeUsdc.toFixed(2),
              stakeUsdc: inputs.stakeUsdc.toFixed(2),
              stakeDays: Math.round(inputs.stakeDays),
              activeDays: inputs.activeDays,
            },
            note: 'Tier breakpoints: COLD at 200, ESTABLISHED at 400, STRONG at 600, ELITE at 800. The fastest levers are completing deals cleanly, staking (amount and duration both count), and avoiding cancellations and disputes. Full breakdown lives on /reputation.',
          };
        } catch (err) {
          logger.warn({ err: (err as Error).message }, 'assistant get_my_reputation failed');
          return { error: 'Could not compute the reputation right now. Try again shortly.' };
        }
      },
    }),

    get_my_market_activity: tool({
      description:
        "Everything the signed-in user has live on the market: their posted OFFERS (listings they sell, with status), their posted REQUESTS (buyer-desk auctions, with how many bids came in), and the bids their seller agent is actively negotiating on other people's requests. Use for 'what have I posted', 'any bids on my request', 'what is my agent bidding on', 'is my offer still live'.",
      inputSchema: z.object({}),
      execute: async () => {
        try {
          const record = await getAgentWallets(address).catch(() => null);
          const offers = listListingsForSeller(address).slice(0, 15).map((l) => ({
            id: l.id,
            title: l.title,
            askingPriceUsdc: l.askingPriceUsdc,
            status: l.matchedAt ? 'matched' : listingStatus(l),
            postedAt: new Date(l.postedAt).toISOString(),
          }));
          const requests = record?.buyerAddress
            ? getBuyerSnapshot(record.buyerAddress).jobs.slice(0, 15).map((j) => ({
                jobId: j.jobId,
                budgetUsdc: j.budgetUsdc,
                deadline: new Date(j.deadlineUnix * 1000).toISOString(),
                status: j.cancelledAt
                  ? 'cancelled'
                  : j.finalized
                    ? 'matched'
                    : j.expiredAt
                      ? 'expired'
                      : 'collecting bids',
                bidsReceived: j.bids.length,
              }))
            : [];
          const activeBids = record?.sellerAddress
            ? getSellerSnapshot(record.sellerAddress).activeBids.slice(0, 15).map((b) => ({
                jobId: b.jobId,
                buyerBudgetUsdc: b.budgetUsdc,
                yourAgentLastBidUsdc: b.lastBidPrice,
                negotiationRounds: b.counterRounds,
                finalized: b.finalized,
              }))
            : [];
          return {
            offers,
            requests,
            sellerAgentActiveBids: activeBids,
            note:
              offers.length + requests.length + activeBids.length === 0
                ? 'Nothing live on the market right now. They can post an offer or a request — you can prepare either with the propose tools.'
                : 'Offers are what they sell; requests are buyer-desk auctions their buyer agent runs; active bids are negotiations their seller agent is in on other buyers’ requests.',
          };
        } catch (err) {
          logger.warn({ err: (err as Error).message }, 'assistant get_my_market_activity failed');
          return { error: 'Could not read the market activity right now. Try again shortly.' };
        }
      },
    }),

    whats_pending: tool({
      description:
        "Everything on this account that needs attention or is in flight, across the whole platform: match proposals awaiting approval, deliveries waiting for release, deals waiting on the counterparty, disputes, approaching deadlines, bridges still relaying, factoring offers awaiting a decision, PO-financing lines, and claimable yield. Call this for 'what needs my attention', 'anything pending', 'what's the status of everything', or as a first read when the user seems unsure what to do next.",
      inputSchema: z.object({}),
      execute: async () => {
        try {
          const [deals, proposals, record, yieldSnap, factSeller, poSeller, poFinancier] =
            await Promise.all([
              listDealsForAddress(address),
              listMatchProposalsForUser(address),
              getAgentWallets(address).catch(() => null),
              readStakerYield(address).catch(() => null),
              listOffersBySeller(address).catch(() => []),
              listLinesBySeller(address).catch(() => []),
              listLinesByFinancier(address).catch(() => []),
            ]);
          const actionNeeded: string[] = [];
          const waitingOnOthers: string[] = [];
          const inFlight: string[] = [];

          for (const p of proposals) {
            if (p.approvedAt || p.declinedAt) continue;
            const myRole = p.buyerUser === address ? 'buyer' : 'seller';
            const awaiting = p.awaitingParty ?? 'seller';
            const price = p.raisedPriceUsdc ?? p.agreedPriceUsdc;
            if (awaiting === myRole) {
              actionNeeded.push(
                `Match proposal on job ${p.jobId} at ${price} USDC is waiting for YOUR approval or decline.`,
              );
            } else {
              waitingOnOthers.push(
                `Match proposal on job ${p.jobId} at ${price} USDC is waiting for the ${awaiting} to approve.`,
              );
            }
          }

          const now = Date.now();
          for (const d of deals) {
            if (d.settledAt || d.cancelledAt) continue;
            const isBuyer = d.buyer === address;
            if (d.disputed) {
              actionNeeded.push(
                `Deal ${d.jobId} (${d.dealAmountUsdc} USDC) is in dispute — the process and timelines are on /docs/disputes.`,
              );
            } else if (d.delivered && isBuyer) {
              actionNeeded.push(
                `Deal ${d.jobId}: the seller delivered. Review the work and release the ${d.dealAmountUsdc} USDC payment.`,
              );
            } else if (d.delivered && !isBuyer) {
              waitingOnOthers.push(
                `Deal ${d.jobId}: you delivered; waiting for the buyer to review and release ${d.dealAmountUsdc} USDC.`,
              );
            } else if (!d.acceptedAt && !isBuyer && !d.pendingCounterparty) {
              actionNeeded.push(
                `Deal ${d.jobId} (${d.dealAmountUsdc} USDC) is waiting for you to accept the escrow.`,
              );
            } else if (
              !isBuyer &&
              d.deadlineUnix &&
              d.deadlineUnix * 1000 - now < 3 * 86_400_000 &&
              d.deadlineUnix * 1000 > now
            ) {
              const daysLeft = Math.max(1, Math.ceil((d.deadlineUnix * 1000 - now) / 86_400_000));
              actionNeeded.push(
                `Deal ${d.jobId}: the delivery deadline is in about ${daysLeft} day${daysLeft === 1 ? '' : 's'}. Deliver on time — missing it lets the buyer reclaim and costs reputation.`,
              );
            } else {
              inFlight.push(`Deal ${d.jobId} (${d.dealAmountUsdc} USDC) is in progress.`);
            }
          }

          const bridgeAddrs = [
            address,
            ...Object.values(record?.bridgeWallets ?? {}).map((w) => w.address),
          ];
          for (const b of await listBridgesForWallets(bridgeAddrs)) {
            if (b.status === 'minted' || b.status === 'error') continue;
            inFlight.push(
              `Bridge of ${b.amountUsdc} USDC is still ${b.status} (track it on /bridge).`,
            );
          }

          for (const f of factSeller) {
            if (f.status !== 'offered' || f.expiresAt < now) continue;
            actionNeeded.push(
              `Factoring offer on invoice ${f.invoiceId}: ${f.offeredAdvanceUsdc} USDC advance now against ${f.faceValueUsdc} face value — accept or reject before it expires.`,
            );
          }
          for (const l of poSeller) {
            if (l.state === 'funded' || l.state === 'released') {
              inFlight.push(
                `PO financing on invoice ${l.invoiceId}: ${l.principalUsdc} USDC funded, ${l.repayUsdc} USDC repays automatically when the deal settles.`,
              );
            }
          }
          for (const l of poFinancier) {
            if (l.state === 'funded' || l.state === 'released') {
              inFlight.push(
                `You are financing invoice ${l.invoiceId}: ${l.principalUsdc} USDC out, ${l.repayUsdc} USDC due back.`,
              );
            }
          }

          if (yieldSnap?.configured && Number(yieldSnap.claimableUsdc) > 0) {
            actionNeeded.push(
              `${yieldSnap.claimableUsdc} USDC of staking yield is claimable at /stake.`,
            );
          }

          return {
            actionNeeded,
            waitingOnOthers,
            inFlight,
            note:
              actionNeeded.length + waitingOnOthers.length + inFlight.length === 0
                ? 'Nothing needs their attention. No open deals, proposals, bridges, financing, or claimable yield.'
                : 'Lead with actionNeeded, mention the rest only if relevant. Each item names the screen to act on.',
          };
        } catch (err) {
          logger.warn({ err: (err as Error).message }, 'assistant whats_pending failed');
          return { error: 'Could not build the pending picture right now. Try again shortly.' };
        }
      },
    }),

    get_my_financing: tool({
      description:
        "The signed-in user's SME trade-finance position, both sides: factoring offers on their invoices (as a seller getting early payout) and offers they made (as a financier), plus PO-financing lines funded for them or by them. Use for 'my factoring offers', 'my financing', 'what am I owed', 'what did I fund'. Empty results are normal for pure P2P users.",
      inputSchema: z.object({}),
      execute: async () => {
        try {
          const [asSellerOffers, asFinancierOffers, sellerLines, financierLines] =
            await Promise.all([
              listOffersBySeller(address),
              listOffersByFinancier(address),
              listLinesBySeller(address),
              listLinesByFinancier(address),
            ]);
          const offer = (o: (typeof asSellerOffers)[number]) => ({
            invoiceId: o.invoiceId,
            advanceUsdc: o.offeredAdvanceUsdc,
            faceValueUsdc: o.faceValueUsdc,
            repayUsdc: o.expectedReturnUsdc,
            discountBps: o.discountBps,
            status: o.status,
            offeredAt: new Date(o.offeredAt).toISOString(),
          });
          const line = (l: (typeof sellerLines)[number]) => ({
            invoiceId: l.invoiceId,
            principalUsdc: l.principalUsdc,
            repayUsdc: l.repayUsdc,
            state: l.state,
            fundedAt: new Date(l.fundedAt).toISOString(),
          });
          return {
            factoringOffersOnMyInvoices: asSellerOffers.slice(0, 10).map(offer),
            factoringOffersIMade: asFinancierOffers.slice(0, 10).map(offer),
            poLinesFundingMe: sellerLines.slice(0, 10).map(line),
            poLinesIFunded: financierLines.slice(0, 10).map(line),
            note: 'Factoring advances pay sellers early against an accepted invoice; repayment auto-pulls when the deal settles. PO financing fronts the purchase before delivery. Both live on the financing surfaces under /jobs and the financier desk.',
          };
        } catch (err) {
          logger.warn({ err: (err as Error).message }, 'assistant get_my_financing failed');
          return { error: 'Could not read the financing position right now. Try again shortly.' };
        }
      },
    }),

    get_my_profile: tool({
      description:
        "The signed-in user's own profile and account setup: display name, account kind (person or business), role, email verification, seller skills and price range, buyer preferences, and whether paid market research is active. Use for 'what does my profile say', 'am I set up as a business', 'what skills do I have listed', or to check setup before advising them.",
      inputSchema: z.object({}),
      execute: async () => {
        try {
          const p = await getProfile(address);
          if (!p) {
            return {
              profile: null,
              note: 'No profile yet. They can set one up at /profile — a display name and seller skills make their agent far more matchable.',
            };
          }
          return {
            displayName: p.displayName,
            role: p.role,
            accountKind: p.accountKind ?? 'person',
            emailVerified: p.emailVerified === true,
            seller: p.seller
              ? {
                  skills: p.seller.skills,
                  bio: p.seller.bio,
                  budgetRangeUsdc: [p.seller.minBudgetUsdc, p.seller.maxBudgetUsdc],
                }
              : null,
            buyer: p.buyer ? { maxBudgetUsdc: p.buyer.maxBudgetUsdc } : null,
            business: p.business ? { onRecord: true } : null,
            paidResearchActive: p.research?.active === true,
            note: 'Edits happen on /profile. Seller skills drive what requests their agent bids on; buyer preferences bound what their agent may agree to.',
          };
        } catch (err) {
          logger.warn({ err: (err as Error).message }, 'assistant get_my_profile failed');
          return { error: 'Could not read the profile right now. Try again shortly.' };
        }
      },
    }),

    explain_error: tool({
      description:
        'Turn a cryptic error the user hit into a plain-language explanation with a next step. Pass the short action they were doing (e.g. "release", "fund", "bridge") and the raw error text they saw.',
      inputSchema: z.object({
        action: z.string().min(1).max(40).describe('Short label for what they were doing.'),
        errorMessage: z.string().min(1).max(1000).describe('The raw error text they saw.'),
      }),
      execute: async ({ action, errorMessage }) => {
        try {
          const d = await diagnoseUserError({ action, errorMessage });
          if (!d) return { error: 'I cannot explain that one right now.' };
          return d;
        } catch (err) {
          logger.warn({ err: (err as Error).message }, 'assistant explain_error failed');
          return { error: 'I could not build an explanation right now. Try again shortly.' };
        }
      },
    }),

    propose_navigation: tool({
      description:
        'Show the user a prominent button that takes them straight to the in-app screen for something they want to DO but that you cannot execute yet: add money / top up, open a direct deal, post a request or an offer, withdraw proceeds, get test USDC, open one of their own deals, browse the market, find partners, view a credit passport, or stake. Prefer this over only describing where to go. You may call it more than once. Keep the label short and specific.',
      inputSchema: z.object({
        destination: z.enum(NAVIGATE_DESTINATIONS).describe('Which screen to send them to.'),
        jobId: z.string().max(120).optional().describe('Required for open_deal: the deal id.'),
        address: z
          .string()
          .max(60)
          .optional()
          .describe('Required for credit_passport: the 0x business address.'),
        rail: z
          .enum(['gateway', 'cctp'])
          .optional()
          .describe('Optional for add_money: which top-up rail. Defaults to the pooled Gateway rail.'),
        label: z.string().max(60).optional().describe('Short, specific button text. Defaults to a sensible label.'),
        description: z.string().max(120).optional().describe('Optional one-line hint under the button.'),
      }),
      execute: async (args) => {
        // open_deal only ever links a deal the caller is actually a party to, so
        // the assistant never offers to open someone else's deal.
        if (args.destination === 'open_deal') {
          if (!args.jobId) return { error: 'open_deal needs a jobId.' };
          try {
            const deal = await getDeal(args.jobId);
            if (!deal || !canViewDeal(deal, address)) {
              return { error: 'That deal is not one of yours, so I will not link it.' };
            }
          } catch (err) {
            logger.warn({ err: (err as Error).message }, 'assistant propose_navigation deal check failed');
            return { error: 'Could not verify that deal right now.' };
          }
        }
        const built = buildNavigateAction(args);
        if ('error' in built) return built;
        // Dedup by href so one reply never shows the same button twice.
        if (!actions.some((a) => a.id === built.id)) actions.push(built);
        return { ok: true, shown: built.label };
      },
    }),

    propose_post_offer: tool({
      description:
        "Prepare a confirm card to post the user's standing OFFER to supply work or goods (a listing on the marketplace). This does NOT post it: it shows the user a card they must approve, then it posts as themselves. Use it when they clearly want to advertise what they sell and have given a title, a short description, and an asking price in USDC. Nothing moves money and the offer can be cancelled later. Do NOT use this for posting a REQUEST for work they need (that funds an auction) — send them to the request desk with propose_navigation instead.",
      inputSchema: z.object({
        title: z.string().min(3).max(120).describe('Short offer title, e.g. "Arabic-English contract translation".'),
        description: z.string().min(5).max(500).describe('What they supply, plainly. One or two sentences.'),
        askingPriceUsdc: z.number().positive().max(5_000_000).describe('Asking price in USDC.'),
        negotiationMaxDecreasePct: z
          .number()
          .min(0)
          .max(50)
          .optional()
          .describe('Optional: how far, in percent, their agent may auto-negotiate below the asking price.'),
        ttlDays: z.number().min(0.0006).max(90).optional().describe('Optional: how many days the offer stays open. Defaults to 30.'),
      }),
      execute: async (args) => {
        // Pre-flight the SAME preconditions the listings route enforces, so the
        // assistant never shows a confirm card that would 409 on submit. When a
        // precondition is missing, guide the model to send them to set it up.
        const agents = await getAgentWallets(address).catch(() => null);
        if (!agents) {
          return { error: 'They must activate their agent wallets first. Offer a button to their profile (destination "profile").' };
        }
        const sellerProfile = await resolveSellerProfile(agents.sellerAddress).catch(() => null);
        if (!sellerProfile) {
          return { error: 'They need a seller profile first. Offer a button to the seller desk (destination "new_offer").' };
        }
        const built = buildPostOfferConfirm({ caller: address, ...args });
        if ('error' in built) return built;
        if (!hasEquivalentConfirm(actions, built)) actions.push(built);
        return { ok: true, shown: built.title };
      },
    }),

    propose_post_request: tool({
      description:
        "Prepare a confirm card to post the user's REQUEST for work or goods they NEED (the agent-mediated path, aka the buyer desk). Use this when they want the platform to find someone for them — e.g. \"find me a developer\", \"I need X built\", \"let the platform look for one\" — and they have given what they need, a budget in USDC, and a deadline. On confirm it posts as themselves; their buyer agent then runs an auction, matches candidates, scores them on skill + reputation, and brings proposals back for them to approve. Nothing is paid until they approve a match. Do NOT use propose_post_offer for this (that advertises what they SELL); this is for what they want to BUY.",
      inputSchema: z.object({
        brief: z.string().min(5).max(500).describe('What they need, plainly. e.g. "web3 developer to build a trading bot". Max 500 characters.'),
        budgetUsdc: z.number().positive().max(5_000_000).describe('Budget in USDC.'),
        // Two ways to give a deadline. NEVER convert a calendar date to days
        // yourself — pass deadlineDate and let the server compute it from its own
        // clock. Only use deadlineDays when the user states a duration directly.
        deadlineDays: z.number().min(0.0006).max(3650).optional().describe('Deadline as a number of days FROM NOW, only when the user gave a duration ("in 3 days", "two weeks").'),
        deadlineDate: z.string().optional().describe('Deadline as an absolute calendar date, normalised to YYYY-MM-DD. Pass this whenever the user gave a date ("before 22/07/2026" -> "2026-07-22"). The server converts it to days; do not compute days yourself.'),
      }),
      execute: async (args) => {
        // Pre-flight the SAME preconditions the jobs route enforces so the card
        // never 409s on submit. Activation + buyer profile are cheap store reads;
        // the buyer-agent balance check stays on the route (its 409 is specific).
        const agents = await getAgentWallets(address).catch(() => null);
        if (!agents) {
          return { error: 'They must activate their agent wallets first. Offer a button to their profile (destination "profile").' };
        }
        const buyerProfile = await resolveBuyerProfileForUser(address).catch(() => null);
        if (!buyerProfile) {
          return { error: 'They need a buyer profile first. Offer a button to the request desk (destination "new_request").' };
        }
        // Resolve the deadline to days-from-now. An absolute date is computed
        // against the server clock so the model never does (and mis-does) the
        // date arithmetic — the "22/07/2026 read as >90 days" bug. Anchor to the
        // END of the given day so a same-week date isn't off-by-one to the past.
        let deadlineDays = args.deadlineDays;
        if (args.deadlineDate) {
          const parsed = Date.parse(`${args.deadlineDate.trim()}T23:59:59Z`);
          if (Number.isNaN(parsed)) {
            return { error: 'I could not read that deadline date. Ask them for it as YYYY-MM-DD or a number of days.' };
          }
          deadlineDays = (parsed - Date.now()) / 86_400_000;
          if (deadlineDays <= 0) {
            return { error: 'That deadline date is in the past. Ask them for a future date.' };
          }
        }
        if (deadlineDays === undefined) {
          return { error: 'Ask them for a deadline: a calendar date (pass deadlineDate) or how many days from now (deadlineDays).' };
        }
        const built = buildPostRequestConfirm({
          caller: address,
          brief: args.brief,
          budgetUsdc: args.budgetUsdc,
          deadlineDays,
          ...(args.deadlineDate ? { deadlineLabel: `by ${args.deadlineDate.trim()}` } : {}),
        });
        if ('error' in built) return built;
        if (!hasEquivalentConfirm(actions, built)) actions.push(built);
        return { ok: true, shown: built.title, note: 'Posting requires their buyer agent to hold the budget in USDC. If confirm returns an insufficient-balance error, offer to fund the buyer agent (propose_gateway_fund_agent) or send them to add money.' };
      },
    }),

    propose_release: tool({
      description:
        "Prepare a confirm card to RELEASE a milestone payment to the seller on one of the buyer's own deals. This pays the seller real USDC from escrow and CANNOT be undone, so it only shows a card the buyer must approve; it never releases on its own. Use it when the buyer clearly wants to pay out, release, or approve a delivery on a specific deal. Only the buyer can release, and only after the seller has marked the work delivered.",
      inputSchema: z.object({
        jobId: z.string().min(1).max(120).describe('The deal id to release the next milestone on.'),
      }),
      execute: async ({ jobId }) => {
        const deal = await getDeal(jobId).catch(() => null);
        if (!deal) return { error: `No deal found with id ${jobId}.` };
        if (deal.buyer !== address) {
          return deal.seller === address
            ? { error: 'Only the buyer can release a payment. On this deal you are the seller, so you receive it, you do not release it.' }
            : { error: 'That deal is not one of yours, so I cannot release it.' };
        }
        if (deal.cancelledAt) return { error: 'That deal was cancelled, so there is nothing to release.' };
        if (deal.settledAt) return { error: 'That deal is already fully settled.' };
        if (deal.disputed) return { error: 'That deal is in dispute, so releasing is paused until it resolves.' };
        if (!deal.delivered) {
          return { error: 'The seller has not marked the work delivered yet, so there is nothing to release. Offer a button to open the deal (destination "open_deal").' };
        }
        if (deal.verificationStatus === 'suspicious' || deal.verificationStatus === 'malicious') {
          return { error: 'Karwan flagged the delivery link and is holding it for review. Release is paused until it clears.' };
        }
        if (!deal.buyerAgentWalletId) {
          return { error: 'This deal has no buyer agent wallet on record, so it cannot be released from here.' };
        }
        let escrow;
        try {
          escrow = await readEscrow(jobId);
        } catch (err) {
          logger.warn({ err: (err as Error).message }, 'assistant propose_release escrow read failed');
          return { error: "Could not read this deal's escrow right now. Try again shortly." };
        }
        const total = escrow.milestonePcts.length;
        const idx = escrow.milestonesReleased; // next milestone to release, 0-based
        if (total === 0) return { error: "Could not read this deal's milestones. Open the deal to release it." };
        if (idx >= total) return { error: 'Every milestone on this deal is already released.' };
        const pct = escrow.milestonePcts[idx] ?? 0;
        if (pct <= 0) return { error: 'Could not determine the next milestone amount for this deal.' };

        const amountWei = (escrow.dealAmount * BigInt(pct)) / 100n;
        const releasedAfter = escrow.released + amountWei;
        const remainingWei = escrow.dealAmount > releasedAfter ? escrow.dealAmount - releasedAfter : 0n;
        const built = buildReleaseConfirm({
          caller: address,
          jobId,
          counterparty: deal.sellerPaytag ?? deal.seller,
          milestoneNumber: idx + 1,
          totalMilestones: total,
          amountUsdc: formatUnits(amountWei, USDC_DECIMALS),
          remainingUsdc: formatUnits(remainingWei, USDC_DECIMALS),
          isFinal: idx + 1 >= total,
        });
        if (!hasEquivalentConfirm(actions, built)) actions.push(built);
        return { ok: true, shown: built.title };
      },
    }),

    propose_withdraw: tool({
      description:
        "Prepare a confirm card to WITHDRAW USDC from one of the user's OWN agent wallets to an external Arc address. Proceeds from deals they SELL land in their seller agent; buyer-side refunds land in their buyer agent. This moves real USDC and cannot be undone, so it only shows a card they must approve. Use it when they clearly want to withdraw or cash out and have given an amount and a destination 0x address.",
      inputSchema: z.object({
        agent: z
          .enum(['buyer', 'seller'])
          .describe('Which agent wallet to withdraw from. Sale proceeds are in the seller agent; buyer refunds in the buyer agent.'),
        toAddress: z.string().min(1).max(60).describe('Destination Arc address, a full 0x-prefixed 20-byte address.'),
        amountUsdc: z.number().positive().max(5_000_000).describe('Amount of USDC to withdraw.'),
      }),
      execute: async ({ agent, toAddress, amountUsdc }) => {
        const to = toAddress.trim();
        if (!/^0x[0-9a-fA-F]{40}$/.test(to)) {
          return { error: 'That destination is not a valid 0x address. Ask them to paste the full address.' };
        }
        const wallets = await getAgentWallets(address).catch(() => null);
        if (!wallets) {
          return { error: 'They have not activated their agent wallets yet. Offer a button to their profile (destination "profile").' };
        }
        const agentAddress = agent === 'buyer' ? wallets.buyerAddress : wallets.sellerAddress;
        let balanceWei: bigint;
        try {
          balanceWei = await readUsdcBalance(agentAddress);
        } catch (err) {
          logger.warn({ err: (err as Error).message }, 'assistant propose_withdraw balance read failed');
          return { error: 'Could not read the agent wallet balance right now. Try again shortly.' };
        }
        let amountWei: bigint;
        try {
          amountWei = parseUnits(amountUsdc.toString(), USDC_DECIMALS);
        } catch {
          return { error: 'That amount is not a valid USDC value.' };
        }
        if (amountWei <= 0n) return { error: 'The amount must be greater than 0.' };
        if (amountWei > balanceWei) {
          return {
            error: `Their ${agent} agent wallet holds only ${formatUnits(balanceWei, USDC_DECIMALS)} USDC, less than ${amountUsdc}. Tell them the available balance and suggest a smaller amount.`,
          };
        }
        const built = buildWithdrawConfirm({
          caller: address,
          agent,
          toAddress: to,
          amountUsdc,
          balanceAfterUsdc: formatUnits(balanceWei - amountWei, USDC_DECIMALS),
        });
        if ('error' in built) return built;
        if (!hasEquivalentConfirm(actions, built)) actions.push(built);
        return { ok: true, shown: built.title };
      },
    }),

    propose_cash_out: tool({
      description:
        "Prepare a confirm card to CASH OUT USDC from the user's Arc wallet to another blockchain (bridge out): move USDC off Arc to Base, Arbitrum, Optimism, Ethereum, Polygon, or Solana. Use when they want to cash out / bridge out / send USDC to another chain and have given an amount, a chain, and a destination address (0x for EVM chains, a base58 address for Solana). This moves real USDC across chains and cannot be undone.",
      inputSchema: z.object({
        destChain: z
          .enum(['base', 'arbitrum', 'optimism', 'ethereum', 'polygon', 'solana'])
          .describe('Destination chain to bridge the USDC to.'),
        toAddress: z.string().min(1).max(60).describe('Destination address: a 0x address for EVM chains, or a base58 address for Solana.'),
        amountUsdc: z.number().positive().max(5_000_000).describe('Amount of USDC to cash out.'),
      }),
      execute: async ({ destChain, toAddress, amountUsdc }) => {
        // Backend-signed cash-out burns from the user's Arc identity DCW, which
        // only exists for Circle (email/passkey) accounts. Web3 users hold their
        // Arc USDC on their own EOA and must sign the burn themselves, so route
        // them to the bridge screen instead of showing an in-chat card.
        if (method !== 'circle') {
          return { error: 'Cashing out from chat is available for email/passkey accounts. This user signed in with a web3 wallet, so they sign the bridge themselves. Send them to the bridge screen with propose_navigation (destination "cash_out").' };
        }
        const chain = CASH_OUT_CHAINS[destChain];
        if (!chain) return { error: 'That chain is not supported for cash-out.' };
        const to = toAddress.trim();
        if (chain.solana) {
          if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(to)) {
            return { error: 'That is not a valid Solana address. Ask them to paste their base58 Solana address.' };
          }
        } else if (!/^0x[0-9a-fA-F]{40}$/.test(to)) {
          return { error: 'That destination is not a valid 0x address. Ask them to paste the full address.' };
        }
        let balanceWei: bigint;
        try {
          balanceWei = await readUsdcBalance(address);
        } catch (err) {
          logger.warn({ err: (err as Error).message }, 'assistant propose_cash_out balance read failed');
          return { error: 'Could not read your Arc balance right now. Try again shortly.' };
        }
        let amountWei: bigint;
        try {
          amountWei = parseUnits(amountUsdc.toString(), USDC_DECIMALS);
        } catch {
          return { error: 'That amount is not a valid USDC value.' };
        }
        if (amountWei <= 0n) return { error: 'The amount must be greater than 0.' };
        if (amountWei > balanceWei) {
          return {
            error: `Your Arc wallet holds only ${formatUnits(balanceWei, USDC_DECIMALS)} USDC, less than ${amountUsdc}. Tell them the available balance and suggest a smaller amount.`,
          };
        }
        const built = buildCashOutConfirm({
          caller: address,
          destChainKey: chain.key,
          destChainLabel: chain.label,
          recipient: to,
          amountUsdc,
          balanceAfterUsdc: formatUnits(balanceWei - amountWei, USDC_DECIMALS),
        });
        if ('error' in built) return built;
        if (!hasEquivalentConfirm(actions, built)) actions.push(built);
        return { ok: true, shown: built.title };
      },
    }),

    propose_gateway_deposit: tool({
      description:
        "Prepare a confirm card to ADD USDC to the user's unified balance (a pooled USDC balance they can use to fund their agent wallets). Use when they want to add money to their balance / top up their unified balance and have given an amount. Available for email/passkey accounts only; the backend moves it from their sign-in wallet.",
      inputSchema: z.object({
        amountUsdc: z.number().positive().max(5_000_000).describe('Amount of USDC to add to the unified balance.'),
      }),
      execute: async ({ amountUsdc }) => {
        if (method !== 'circle') {
          return { error: 'A unified balance is for email/passkey accounts. This user holds their own wallet, so tell them (warmly) that they are in full control, and to trade hands-free they just fund their buyer and seller agent wallets directly from their wallet. Offer a button to their profile (destination "profile") where the agent addresses and funding live.' };
        }
        let balanceWei: bigint;
        try {
          balanceWei = await readUsdcBalance(address);
        } catch (err) {
          logger.warn({ err: (err as Error).message }, 'assistant propose_gateway_deposit balance read failed');
          return { error: 'Could not read your wallet balance right now. Try again shortly.' };
        }
        let amountWei: bigint;
        try {
          amountWei = parseUnits(amountUsdc.toString(), USDC_DECIMALS);
        } catch {
          return { error: 'That amount is not a valid USDC value.' };
        }
        if (amountWei > balanceWei) {
          return { error: `Your wallet holds only ${formatUnits(balanceWei, USDC_DECIMALS)} USDC, less than ${amountUsdc}. Suggest a smaller amount or adding money first.` };
        }
        const built = buildGatewayDepositConfirm({
          amountUsdc,
          balanceAfterUsdc: formatUnits(balanceWei - amountWei, USDC_DECIMALS),
        });
        if ('error' in built) return built;
        if (!hasEquivalentConfirm(actions, built)) actions.push(built);
        return { ok: true, shown: built.title };
      },
    }),

    propose_gateway_fund_agent: tool({
      description:
        "Prepare a confirm card to FUND one of the user's agent wallets from their unified balance, so the agent can trade. Use when they want to fund / top up their buyer or seller agent from their balance and have given an amount. Requires a funded unified balance.",
      inputSchema: z.object({
        agent: z.enum(['buyer', 'seller']).describe('Which agent wallet to fund.'),
        amountUsdc: z.number().positive().max(5_000_000).describe('Amount of USDC to move from the unified balance to the agent.'),
      }),
      execute: async ({ agent, amountUsdc }) => {
        const unified = await readUserGatewayBalance(address).catch(() => null);
        if (!unified || unified.available <= 0) {
          return { error: 'They have no unified balance yet. Suggest adding money to their balance first with propose_gateway_deposit (or, for a web3 wallet, funding the agent directly).' };
        }
        if (unified.available < amountUsdc) {
          return { error: `Their unified balance is ${unified.available.toFixed(2)} USDC, less than ${amountUsdc}. Suggest a smaller amount or adding money first.` };
        }
        const built = buildGatewayFundAgentConfirm({
          agent,
          amountUsdc,
          balanceAfterUsdc: (unified.available - amountUsdc).toFixed(2),
        });
        if ('error' in built) return built;
        if (!hasEquivalentConfirm(actions, built)) actions.push(built);
        return { ok: true, shown: built.title };
      },
    }),

    propose_gateway_cash_out: tool({
      description:
        "Prepare a confirm card to CASH OUT USDC from the user's UNIFIED BALANCE to another blockchain (Base, Arbitrum, Optimism, Ethereum, Polygon). Use when they want to cash out or send USDC from their unified balance to another chain and have given an amount, a chain, and a 0x address. This is distinct from propose_cash_out (which sends from their Arc wallet); use THIS when the money should come from their unified balance. Works for every account type. Requires a funded unified balance.",
      inputSchema: z.object({
        destChain: z
          .enum(['base', 'arbitrum', 'optimism', 'ethereum', 'polygon'])
          .describe('Destination chain to bridge the USDC to.'),
        toAddress: z.string().min(1).max(60).describe('Destination address on that chain, a full 0x address.'),
        amountUsdc: z.number().positive().max(5_000_000).describe('Amount of USDC to cash out.'),
      }),
      execute: async ({ destChain, toAddress, amountUsdc }) => {
        const to = toAddress.trim();
        if (!/^0x[0-9a-fA-F]{40}$/.test(to)) {
          return { error: 'That destination is not a valid 0x address. Ask them to paste the full address.' };
        }
        const chain = CASH_OUT_CHAINS[destChain];
        if (!chain) return { error: 'That chain is not supported for cash-out.' };
        const unified = await readUserGatewayBalance(address).catch(() => null);
        if (!unified || unified.available <= 0) {
          return { error: 'They have no unified balance yet. Suggest adding money to it first with propose_gateway_deposit.' };
        }
        if (unified.available < amountUsdc) {
          return { error: `Their unified balance is ${unified.available.toFixed(2)} USDC, less than ${amountUsdc}. Suggest a smaller amount or adding money first.` };
        }
        const built = buildGatewayCashOutConfirm({
          destChainKey: chain.key,
          destChainLabel: chain.label,
          recipient: to,
          amountUsdc,
          balanceAfterUsdc: (unified.available - amountUsdc).toFixed(2),
        });
        if ('error' in built) return built;
        if (!hasEquivalentConfirm(actions, built)) actions.push(built);
        return { ok: true, shown: built.title };
      },
    }),
  };
}

/// The authenticated-assistant preamble, appended to the shared knowledge base.
/// It grants the read tools and draws the hard read-only line.
function authenticatedPreamble(address: string, method: string): string {
  const circle = method === 'circle';
  const today = new Date().toISOString().slice(0, 10);
  return [
    '',
    `# Today is ${today} (UTC).`,
    'When a user gives a deadline as a calendar DATE, do NOT compute days yourself — pass it to the tool as',
    'deadlineDate (normalise to YYYY-MM-DD) and the server converts it. Only use deadlineDays for a stated',
    'duration ("in 3 days"). Never tell a user a near date is "too far out" — the server checks the real cap.',
    '',
    '# You have durable memory of this account',
    'Chat transcripts reset between sessions, but recall_activity reads the durable per-account record:',
    'past money movements, bridges, and agent matches, with dates. When the user references anything that',
    'already happened ("we bridged 20 USDC to Base two days ago", "who was the counterparty you matched me',
    'with last week"), call recall_activity (and list_my_deals for deals) and answer from the records.',
    'NEVER reply that you have no memory of past sessions without checking these tools first.',
    '',
    '# You can see EVERYTHING on this account. Route every question to a tool.',
    'Balances (wallet, agents, unified, gas) -> get_my_balance. Staking + yield -> get_my_stake.',
    'Reputation score/tier -> get_my_reputation. Deals -> list_my_deals / get_deal_status.',
    'Open offers, requests, agent bids -> get_my_market_activity. Factoring + PO financing -> get_my_financing.',
    'Past money moves, bridges, matches -> recall_activity. Profile/setup -> get_my_profile.',
    'Anything pending or "what should I do" -> whats_pending.',
    'NEVER answer a question about their account from general knowledge or say the data "isn\'t showing" —',
    'if one tool comes back empty, think about which OTHER tool actually holds that answer and call it.',
    'A staking question is get_my_stake even if get_my_balance showed no stake line.',
    '',
    '# You are an ACTING assistant for a SIGNED-IN user (NOT guidance-only)',
    `Signed in as ${address} via ${method}. IGNORE any earlier line that says you are "guidance only" or`,
    'that you "cannot move funds or act" — for THIS signed-in user you CAN, through the tools below. Every',
    'action still runs through a confirm card the user taps, so you never move money on your own — but you',
    'PREPARE it directly and confidently. Think of yourself as a capable operator who gets things done.',
    '',
    '## Be autonomous. Do NOT interrogate.',
    '- When the user tells you to do something, DO IT: call the right tool immediately and let the confirm',
    '  card carry the details. Do NOT ask which wallet, which source, or to re-confirm what they just said.',
    `- Default the source to their MAIN wallet (their ${circle ? 'sign-in' : 'identity'} wallet) unless they`,
    '  name another. The card shows source + amount + destination, so the user verifies correctness THERE —',
    '  that IS the confirmation. Never ask a question the card already answers.',
    '- Ask ONLY when a REQUIRED value is genuinely missing (no destination address, or no amount). Then ask',
    '  once, in one short line. Never ask twice.',
    '- If they request several things at once, prepare ALL the cards in the same turn.',
    '',
    '## When you show a confirm card, say ONE short line at most.',
    '  The card already shows from / amount / to / balance-after / any warning. Do NOT restate the amount,',
    '  the address, or "this is final" in prose — that is noise the card already covers. Something like',
    '  "Done — confirm below." is enough. Often no words are needed at all.',
    '',
    '## What you can do (each via a confirm card):',
    '- READ (always read before stating a number; never guess): get_my_balance (full money picture — the',
    '  sign-in wallet, both agent wallets, and the unified balance), list_my_deals, get_deal_status, explain_error.',
    '- Post a standing OFFER (what they SELL): propose_post_offer(title, description, price). No money, cancelable.',
    '- Post a REQUEST (what they NEED — the agent-mediated deal): propose_post_request(brief, budget, deadlineDays).',
    '  Use this the moment they say "find me a developer", "let the platform look for one", "I need X built".',
    '  Their buyer agent then runs the auction and brings proposals to approve; nothing is paid until they approve.',
    '- RELEASE a milestone to the seller (buyer only, after delivery): propose_release(jobId). FINAL.',
    '- WITHDRAW from an agent wallet to an Arc 0x address: propose_withdraw(agent, toAddress, amount). FINAL.',
    '- CASH OUT from the Arc wallet to another chain (Base/Arbitrum/Optimism/Ethereum/Polygon/SOLANA):',
    '  propose_cash_out (0x address for EVM, base58 for Solana). FINAL.',
    '- UNIFIED BALANCE (the pooled USDC that funds agents hands-free): add to it (propose_gateway_deposit),',
    '  fund an agent from it (propose_gateway_fund_agent), cash it out to another chain (propose_gateway_cash_out).',
    '  Prefer propose_gateway_cash_out when they already have a unified balance.',
    '- NAVIGATE (propose_navigation) for things chat cannot do yet: top up USDC onto Arc, settings, faucet.',
    '  Show a button; do not just describe the page.',
    '',
    circle
      ? '## This is a Circle (email/passkey) account: the backend signs EVERYTHING. No wallet popup ever. Just prepare the card.'
      : '## This is a web3 wallet. Their AGENT wallets are still backend-signed, so release, withdraw-from-agent, and fund-agent all work from chat. ONLY actions on their own identity EOA (cash out FROM their Arc wallet, or top up) need their own signature, which chat cannot do yet — for those, send them to the bridge screen with propose_navigation and frame it warmly as them keeping custody.',
    '- Amounts are USDC on Arc testnet. Be warm, brief, and just get it done.',
  ].join('\n');
}

/// Run the authenticated tool-calling loop and return the assistant's reply plus
/// any navigate actions it surfaced (rendered as buttons in the chat). Throws on
/// model failure/timeout so the route can fall back to the anonymous knowledge-
/// only path. Bounded to a few tool steps so one turn is cheap.
export async function runAssistantAgent(input: {
  address: string;
  method: string;
  messages: AssistantChatMessage[];
}): Promise<{ text: string; actions: AssistantAction[] }> {
  const model = assistantAgentModel;
  if (!model) throw new Error('assistant agent model unavailable');

  const system = KARWAN_ASSISTANT_SYSTEM + '\n' + authenticatedPreamble(input.address, input.method);
  const actions: AssistantAction[] = [];

  const { text } = await withLlmTimeout(
    'assistant.agent',
    generateText({
      model,
      system,
      messages: input.messages,
      tools: buildTools(input.address, input.method, actions),
      // Allow a few reasoning+tool rounds (e.g. whats_pending, then read one
      // deal, then propose a button), then force a final text answer.
      stopWhen: stepCountIs(6),
      maxOutputTokens: 900,
    }),
    30_000,
  );

  return { text: text.trim(), actions };
}
