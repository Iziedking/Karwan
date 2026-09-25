import type { Page, Route } from '@playwright/test';
import { decodeFunctionData, encodeFunctionResult, multicall3Abi, type Hex } from 'viem';

export const API = 'http://127.0.0.1:3199';
export const RPC = 'http://127.0.0.1:3198';
export const ME = '0x1111111111111111111111111111111111111111';
export const BUYER_AGENT = '0x3333333333333333333333333333333333333333';
export const SELLER_AGENT = '0x4444444444444444444444444444444444444444';
export const TX = `0x${'ab'.repeat(32)}`;
const ARC_CHAIN_ID_HEX = '0x4cef52'; // 5042002, Arc testnet

/// USDC on Arc is the native token, with 18 decimals.
function wei(usdc: number): string {
  return `0x${(BigInt(Math.round(usdc * 1e6)) * 10n ** 12n).toString(16)}`;
}

export const funded: Record<string, number> = {
  [ME.toLowerCase()]: 1240.5,
  [BUYER_AGENT.toLowerCase()]: 120,
  [SELLER_AGENT.toLowerCase()]: 0,
};

export const recentActivity = [
  {
    id: 'a1', ts: Date.UTC(2026, 8, 20), kind: 'deposit', summary: 'Received 500 USDC', params: null,
    amountUsdc: '500', txHash: '0xabc', refId: 'KWN-2026-0001', chain: 'arc', jobId: null, status: 'done',
  },
  {
    id: 'a2', ts: Date.UTC(2026, 8, 21), kind: 'agent_topup',
    summary: 'Topped up the buyer agent wallet with 50 USDC from the sign-in wallet',
    params: { t: 'agentTopUp', amount: '50', agent: 'buyer' },
    amountUsdc: '50', txHash: '0xdef', refId: 'KWN-2026-0002', chain: 'arc', jobId: null, status: 'done',
  },
];

export interface MoneyWorld {
  balances: Record<string, number>;
  activity?: unknown[];
  /// Transfer records seeded into this browser's bridge store.
  bridges?: unknown[];
  fundAgent?: (route: Route) => Promise<void>;
  withdraw?: (route: Route) => Promise<void>;
  bridgeOut?: (route: Route) => Promise<void>;
  /// The live stream's body, served on every (re)connection.
  events?: () => string;
}

/// One live-stream event in the stream's own framing.
export function sseEvent(event: Record<string, unknown>): string {
  return `event: karwan\ndata: ${JSON.stringify(event)}\n\n`;
}

/// Serves the backend and the Arc RPC from fixtures. Anything else answers with
/// empty list-shaped JSON so no request hangs the page.
export async function serveMoney(page: Page, world: MoneyWorld) {
  await page.addInitScript(({ me, bridges }) => {
    try {
      localStorage.setItem('karwan:guide:disabled', '1');
      if (bridges) localStorage.setItem(`karwan:bridges:${me}`, JSON.stringify(bridges));
    } catch {
      /* private mode */
    }
  }, { me: ME.toLowerCase(), bridges: world.bridges ?? null });

  await page.route(`${RPC}/**`, async (route) => {
    type Call = { id: number; method: string; params?: unknown[] };
    const answer = (call: Call) => {
      if (call.method === 'eth_chainId') return { jsonrpc: '2.0', id: call.id, result: ARC_CHAIN_ID_HEX };
      if (call.method === 'eth_blockNumber') return { jsonrpc: '2.0', id: call.id, result: '0x1' };
      if (call.method === 'eth_getCode') return { jsonrpc: '2.0', id: call.id, result: '0x' };
      // The Arc client batches balance reads through Multicall3's aggregate3.
      if (call.method === 'eth_call') {
        const data = (call.params?.[0] as { data?: Hex } | undefined)?.data;
        if (data?.startsWith('0x82ad56cb')) {
          const { args } = decodeFunctionData({ abi: multicall3Abi, data });
          const calls = (args?.[0] ?? []) as ReadonlyArray<{ callData: Hex }>;
          const results = calls.map((inner) => {
            const decoded = decodeFunctionData({ abi: multicall3Abi, data: inner.callData });
            if (decoded.functionName !== 'getEthBalance') return { success: false, returnData: '0x' as Hex };
            const address = String(decoded.args?.[0] ?? '').toLowerCase();
            return {
              success: true,
              returnData: encodeFunctionResult({ abi: multicall3Abi, functionName: 'getEthBalance', result: BigInt(wei(world.balances[address] ?? 0)) }),
            };
          });
          return { jsonrpc: '2.0', id: call.id, result: encodeFunctionResult({ abi: multicall3Abi, functionName: 'aggregate3', result: results }) };
        }
      }
      if (call.method === 'eth_getBalance') {
        const address = String(call.params?.[0] ?? '').toLowerCase();
        return { jsonrpc: '2.0', id: call.id, result: wei(world.balances[address] ?? 0) };
      }
      return { jsonrpc: '2.0', id: call.id, result: null };
    };
    const body = route.request().postDataJSON() as Call | Call[];
    return route.fulfill({ json: Array.isArray(body) ? body.map(answer) : answer(body) });
  });

  await page.route(`${API}/**`, async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/auth/bootstrap') {
      return route.fulfill({ json: { user: { address: ME, method: 'circle', hasPasskey: true }, profile: null } });
    }
    if (path === '/api/activation/status') {
      return route.fulfill({ json: { activated: true, agents: { buyer: BUYER_AGENT, seller: SELLER_AGENT } } });
    }
    if (path === '/api/gateway/balance') {
      return route.fulfill({ json: { balance: { address: ME, confirmed: '0', pending: '0', chains: [], fetchedAt: 0 } } });
    }
    if (path === '/api/activity/me') return route.fulfill({ json: { items: world.activity ?? recentActivity } });
    if (path === '/api/bridge/list') return route.fulfill({ json: { bridges: [] } });
    if (path === '/api/deposit/address') {
      return route.fulfill({
        json: { supported: true, chains: [{ key: 'baseSepolia', name: 'Base Sepolia', address: ME }], solana: null },
      });
    }
    if (path === '/api/activation/fund-agent' && world.fundAgent) return world.fundAgent(route);
    if (path === '/api/activation/withdraw' && world.withdraw) return world.withdraw(route);
    if (path === '/api/bridge/circle-bridge-out' && world.bridgeOut) return world.bridgeOut(route);
    if (path === '/api/events') {
      return route.fulfill({
        status: 200,
        headers: { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' },
        body: `retry: 200\n\n${world.events?.() ?? ''}`,
      });
    }
    if (path.startsWith('/api/client-errors')) return route.fulfill({ status: 204, body: '' });
    return route.fulfill({
      json: { items: [], events: [], movements: [], messages: [], bridges: [], deals: [], requests: [] },
    });
  });
}

/// Watches the console for React hydration errors while a page loads.
export function watchHydration(page: Page): () => string[] {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error' && /hydrat|#418|#423|#425/i.test(message.text())) errors.push(message.text());
  });
  return () => errors;
}

/// How many visible controls inside the page body wear the accent colour.
export async function accentControls(page: Page): Promise<number> {
  return page.evaluate(() => {
    const surfaces = document.querySelectorAll('.product-surface');
    const root = surfaces[surfaces.length - 1];
    if (!root) return -1;
    const probe = document.createElement('span');
    probe.style.color = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim();
    document.body.appendChild(probe);
    const accent = getComputedStyle(probe).color;
    probe.remove();
    return [...root.querySelectorAll<HTMLElement>('a, button')].filter(
      (el) => el.offsetParent !== null && getComputedStyle(el).backgroundColor === accent,
    ).length;
  });
}
