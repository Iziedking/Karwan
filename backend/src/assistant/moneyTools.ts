import { tool } from 'ai';
import { z } from 'zod';
import { logger } from '../logger.js';
import { CCTP_CHAIN_KEYS, CCTP_CHAINS, type CctpChainKey } from '../chain/cctpChains.js';
import { hasEquivalentConfirm, type AssistantAction, type ConfirmAction } from './actions.js';
import {
  buildCancelMoneyMoveConfirm,
  buildPauseMoneyOutConfirm,
  buildPayPaymentLinkConfirm,
  buildRecheckMoneyMoveConfirm,
  buildRecheckPayoutConfirm,
  buildRemovePayoutAddressConfirm,
  buildRetryMoneyMoveConfirm,
  buildTestUsdcConfirm,
  buildTestUsdcOnChainConfirm,
} from './moneyActions.js';

/// Money tools (view 31 phase D). Reads go through the person's own routes, as
/// their pages read them; each step is a card the route re-checks on confirm.

type Call = (address: string, method: 'GET' | 'POST', path: string, body?: unknown) => Promise<{ status: number; json: Record<string, unknown> }>;

export interface MoneyToolDeps {
  call: Call;
  signer: 'karwan' | 'wallet';
  testnet: boolean;
  /// USDC on Arc in the person's own wallet, or null when it cannot be read.
  walletUsdc: () => Promise<number | null>;
  /// Name for a payment link's recipient: tag first.
  nameOf: (address: string) => Promise<string>;
}

interface BridgeRow {
  bridgeId: string;
  status: string;
  amountUsdc: string;
  direction: 'in' | 'out';
  sourceTxHash: string | null;
  sourceChainKey: string | null;
  destChainKey: string | null;
  error: string | null;
  createdAt: number;
  updatedAt: number;
}
interface RailRow {
  id: string;
  rail: string;
  direction: string;
  status: string;
  expectedUsdcMicros: string | null;
  failureCode: string | null;
  createdAt: number;
}

const TOKEN = /^[0-9a-f-]{36}$/i;
const JOB = /^0x[0-9a-fA-F]{64}$/;
const DONE_RAIL = new Set(['completed', 'cancelled']);
/// A move younger than this is still on its way, not stuck.
const SETTLING_MS = 10 * 60_000;

const chainName = (key: string | null) => (key && (CCTP_CHAIN_KEYS as readonly string[]).includes(key) ? CCTP_CHAINS[key as CctpChainKey].name : key === 'solanaDevnet' ? 'Solana' : 'Arc');
const railLabel = (r: RailRow) => {
  const amount = r.expectedUsdcMicros ? ` ${(Number(r.expectedUsdcMicros) / 1e6).toFixed(2)} USDC` : '';
  return `${r.rail.replace(/_/g, ' ')}${amount}`;
};

function offer(actions: AssistantAction[], built: ConfirmAction | { error: string }) {
  if ('error' in built) return built;
  if (!hasEquivalentConfirm(actions, built)) actions.push(built);
  return { ok: true, shown: built.title };
}

async function guarded<T>(name: string, run: () => Promise<T>): Promise<T | { error: string }> {
  try {
    return await run();
  } catch (err) {
    logger.warn({ err: (err as Error).message }, `assistant ${name} failed`);
    return { error: 'Could not prepare that right now. Try again shortly.' };
  }
}

export function moneyTools(address: string, actions: AssistantAction[], deps: MoneyToolDeps) {
  const me = address.toLowerCase();
  const bridges = async (): Promise<BridgeRow[]> => {
    const r = await deps.call(me, 'GET', `/api/bridge/list?address=${me}`);
    return r.status === 200 && Array.isArray(r.json.bridges) ? (r.json.bridges as BridgeRow[]) : [];
  };
  const rails = async (): Promise<RailRow[]> => {
    const r = await deps.call(me, 'GET', '/api/money/intents');
    return r.status === 200 && Array.isArray(r.json.intents) ? (r.json.intents as RailRow[]) : [];
  };

  return {
    list_stuck_money_moves: tool({
      description:
        "List the person's money moves between networks and money rails that have not finished: what, how much, since when, and what went wrong. Use when they ask where their money is, why a transfer has not arrived, or whether something is stuck. Then offer propose_fix_money_move.",
      inputSchema: z.object({}),
      execute: async () =>
        guarded('list_stuck_money_moves', async () => {
          const now = Date.now();
          const [b, r] = await Promise.all([bridges(), rails()]);
          const moves = [
            ...b
              .filter((x) => x.status !== 'minted' && (x.status === 'error' || now - x.updatedAt > SETTLING_MS))
              .map((x) => ({
                kind: 'bridge' as const,
                id: x.bridgeId,
                what: x.direction === 'out' ? `Out of Karwan to ${chainName(x.destChainKey)}` : `Into Karwan from ${chainName(x.sourceChainKey)}`,
                amountUsdc: x.amountUsdc,
                since: new Date(x.createdAt).toISOString(),
                problem: x.status === 'error' ? 'It stopped with an error.' : 'It has not arrived yet.',
              })),
            ...r
              .filter((x) => !DONE_RAIL.has(x.status))
              .map((x) => ({ kind: 'rail' as const, id: x.id, what: railLabel(x), since: new Date(x.createdAt).toISOString(), problem: x.failureCode ? 'It stopped and can be tried again or cancelled.' : 'It is waiting on a step.' })),
          ];
          return {
            moves,
            note: moves.length
              ? 'Describe each in plain words, never the id. A bridge move can be checked again; a rail move can be tried again or cancelled.'
              : 'Nothing is stuck. Every move has finished.',
          };
        }),
    }),

    propose_fix_money_move: tool({
      description:
        "Prepare a card to unstick one move from list_stuck_money_moves. kind 'bridge': Karwan checks it again, or carries on where it stopped. kind 'rail': action 'retry' or 'cancel'. Nothing is ever sent twice.",
      inputSchema: z.object({
        kind: z.enum(['bridge', 'rail']),
        id: z.string().min(1).max(160).describe('The id from list_stuck_money_moves.'),
        action: z.enum(['retry', 'cancel']).optional().describe("For kind 'rail' only."),
      }),
      execute: async ({ kind, id, action }) =>
        guarded('propose_fix_money_move', async () => {
          if (kind === 'bridge') {
            const row = (await bridges()).find((x) => x.bridgeId === id);
            if (!row) return { error: 'That move is not one of theirs. Call list_stuck_money_moves again.' };
            // A Karwan-sent move with no first-network transaction has not left
            // yet: carry it on. Anything that left is looked for again.
            const notStarted = deps.signer === 'karwan' && !row.sourceTxHash;
            return offer(actions, buildRecheckMoneyMoveConfirm({ bridgeId: id, amountUsdc: row.amountUsdc, direction: row.direction, status: row.status, notStarted }));
          }
          const row = (await rails()).find((x) => x.id === id);
          if (!row) return { error: 'That move is not one of theirs. Call list_stuck_money_moves again.' };
          const input = { intentId: id, label: railLabel(row), status: row.status };
          return offer(actions, action === 'cancel' ? buildCancelMoneyMoveConfirm(input) : buildRetryMoneyMoveConfirm(input));
        }),
    }),

    propose_recheck_payout: tool({
      description:
        "Prepare a card for the BUYER to check again a deal payment that was released but did not confirm, so the deal records it. Use when a deal says a payment needs attention, or 'I released but it still shows unpaid'.",
      inputSchema: z.object({ jobId: z.string().regex(JOB).describe('The deal id.') }),
      execute: async ({ jobId }) =>
        guarded('propose_recheck_payout', async () => {
          const r = await deps.call(me, 'GET', `/api/deals/direct/${jobId}/movements?caller=${me}`);
          if (r.status !== 200) return { error: 'That deal is not one of theirs.' };
          const stuck = (r.json.movements as Array<{ kind: string; state: string; reference: string; amountUsdc?: string }> | undefined ?? [])
            .find((m) => m.kind === 'milestone_payout' && m.state === 'needs_attention');
          if (!stuck) return { error: 'No payment on this deal is waiting for a check.' };
          return offer(actions, buildRecheckPayoutConfirm({ jobId, caller: me, reference: stuck.reference, amountUsdc: stuck.amountUsdc ?? '0' }));
        }),
    }),

    propose_pay_payment_link: tool({
      description:
        "Prepare a card to pay someone's Karwan payment link from the person's balance on Arc. Pass the link's id (the last part of the link). Not a protected deal: the money goes straight to them. Use for 'pay this link', 'settle Ada's payment request'.",
      inputSchema: z.object({ token: z.string().regex(TOKEN).describe('The payment link id.') }),
      execute: async ({ token }) =>
        guarded('propose_pay_payment_link', async () => {
          if (deps.signer === 'wallet') return { error: 'They pay from their own wallet, on the payment link page. Offer a button to it with propose_navigation (destination "payment_link").' };
          const r = await deps.call(me, 'GET', `/api/deposit/requests/${token.toLowerCase()}`);
          const request = r.json.request as { recipientAddress: string; amountUsdc: string | null; remainingUsdc?: string; purpose?: string; status: string } | undefined;
          if (r.status !== 200 || !request) return { error: 'No payment link has that id.' };
          if (request.recipientAddress.toLowerCase() === me) return { error: 'That is their own payment link.' };
          return offer(actions, buildPayPaymentLinkConfirm({
            token: token.toLowerCase(),
            recipient: request.recipientAddress,
            recipientLabel: await deps.nameOf(request.recipientAddress),
            amountUsdc: Number(request.remainingUsdc ?? request.amountUsdc ?? 0),
            ...(request.purpose ? { note: request.purpose } : {}),
            status: request.status,
            walletUsdc: await deps.walletUsdc(),
          }));
        }),
    }),

    propose_test_usdc: tool({
      description:
        "Testnet only. Prepare a card to get free test USDC from Circle's faucet: to their wallet, buying agent or selling agent on Arc, or (chain set) to their own wallet on another test network to try bringing money in. About 20 USDC per wallet every 2 hours.",
      inputSchema: z.object({
        to: z.enum(['wallet', 'buying_agent', 'selling_agent']).default('wallet'),
        chain: z.enum(CCTP_CHAIN_KEYS).optional().describe('Another test network, for their own wallet there.'),
      }),
      execute: async ({ to, chain }) =>
        guarded('propose_test_usdc', async () => {
          if (chain) return offer(actions, buildTestUsdcOnChainConfirm({ address: me, chain, chainName: CCTP_CHAINS[chain].name, testnet: deps.testnet }));
          const target = to === 'buying_agent' ? 'buyer' : to === 'selling_agent' ? 'seller' : 'identity';
          return offer(actions, buildTestUsdcConfirm({ address: me, target, testnet: deps.testnet }));
        }),
    }),

    get_money_out_status: tool({
      description:
        "Read where money can leave the account: the saved payout addresses (and when each can receive), the limit left today, and whether money out is paused. Use before propose_remove_payout_address, or when they ask about their payout addresses or limit.",
      inputSchema: z.object({}),
      execute: async () =>
        guarded('get_money_out_status', async () => {
          const r = await deps.call(me, 'GET', '/api/money-out/status');
          if (r.status !== 200) return { error: 'Could not read it just now.' };
          const addresses = (r.json.addresses as Array<{ id: string; chain: string; address: string; opensAt: number }> | undefined ?? []).map((a) => ({
            addressId: a.id,
            network: chainName(a.chain),
            address: `${a.address.slice(0, 6)}…${a.address.slice(-4)}`,
            canReceive: a.opensAt <= Date.now() ? 'now' : new Date(a.opensAt).toUTCString(),
          }));
          return { paused: r.json.paused === true, leftTodayUsdc: r.json.leftUsdc, limitUsdc: r.json.limitUsdc, addresses, note: 'Never show addressId.' };
        }),
    }),

    propose_pause_money_out: tool({
      description:
        "Prepare a card to pause all money leaving the account, for when their phone was lost or they see a payment they did not make. Resuming needs World ID on the account page.",
      inputSchema: z.object({}),
      execute: async () =>
        guarded('propose_pause_money_out', async () => {
          const r = await deps.call(me, 'GET', '/api/money-out/status');
          if (r.status !== 200) return { error: 'Could not read it just now.' };
          return offer(actions, buildPauseMoneyOutConfirm({ paused: r.json.paused === true }));
        }),
    }),

    propose_remove_payout_address: tool({
      description: 'Prepare a card to remove one saved payout address. Call get_money_out_status first for the addressId.',
      inputSchema: z.object({ addressId: z.string().min(1).max(120) }),
      execute: async ({ addressId }) =>
        guarded('propose_remove_payout_address', async () => {
          const r = await deps.call(me, 'GET', '/api/money-out/status');
          const found = (r.json.addresses as Array<{ id: string; chain: string; address: string }> | undefined ?? []).find((a) => a.id === addressId);
          if (!found) return { error: 'That address is not saved on their account.' };
          return offer(actions, buildRemovePayoutAddressConfirm({ addressId, address: found.address, chainName: chainName(found.chain) }));
        }),
    }),
  };
}
