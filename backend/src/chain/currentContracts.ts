import { resolve, dirname } from 'node:path';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { erc20Abi, formatUnits } from 'viem';
import { eq } from 'drizzle-orm';
import { publicClient } from './client.js';
import { DEPLOY_LEDGER, type ContractKind } from './deployLedger.js';
import { config } from '../config.js';
import { logger } from '../logger.js';
import { db, pgEnabled } from '../db/client.js';
import { appSnapshots } from '../db/schema.js';

/// What the contracts in service right now are actually holding.
///
/// The all-time scan answers "what has this platform ever moved", summed from
/// logs. It cannot answer "is that contract still there and what is in it",
/// because a log is a record of the past and a balance is a fact about now.
/// Those are different reads: one walks history, the other calls the chain at
/// head. So this is a separate module rather than another field on the sweep.
///
/// Refreshed on a slow clock. A balance changes when somebody funds or releases
/// a deal, which the activity feed already reports as it happens; this surface
/// exists to say what is deployed and what it custodies, and that answer does
/// not need to be a second old. Daily is the floor, with a shorter serve-TTL so
/// a manual reload after a deploy shows the new address without a wait.

const SNAPSHOT_KEY = 'current_contracts_v1';
const STATE_PATH =
  process.env.CURRENT_CONTRACTS_STORE_PATH ??
  resolve(process.cwd(), 'data', 'currentContracts.json');

const USDC_DECIMALS = 6;

/// How long a snapshot is served before a background refresh is kicked off.
const SERVE_TTL_MS = Number(process.env.CURRENT_CONTRACTS_TTL_MS ?? 15 * 60_000);
/// The unconditional refresh, run on a timer rather than on traffic so the
/// numbers are current even on a page nobody loaded overnight.
const REFRESH_EVERY_MS = Number(process.env.CURRENT_CONTRACTS_REFRESH_MS ?? 24 * 60 * 60_000);

export interface CurrentContract {
  name: string;
  kind: ContractKind;
  address: string;
  /// Block the CREATE landed in, recovered from the deploy ledger. Null when
  /// the configured address is not one this repo deployed, which is worth
  /// showing rather than hiding: it means the env points somewhere unexpected.
  deployBlock: string | null;
  /// Whether the address has bytecode at head. A configured address with no
  /// code is a misconfiguration, and the page should say so rather than render
  /// a confident zero.
  live: boolean;
  /// USDC the contract custodies right now. Null for contracts that never hold
  /// money, so the page can leave the cell empty instead of printing 0.00 and
  /// implying an empty vault.
  usdcBalance: string | null;
  /// How many earlier generations of this same contract came before it. The
  /// all-time page is largely about the fact that these were replaced, so the
  /// count belongs next to the live one.
  supersededGenerations: number;
}

export interface CurrentContractsSnapshot {
  chainId: number;
  /// Head block at the time of the read, so a reader can date the balances.
  atBlock: string;
  contracts: CurrentContract[];
  totals: {
    live: number;
    configured: number;
    /// USDC held across every current contract. The platform's custody
    /// position in one number.
    custodiedUsdc: string;
  };
  readAt: number;
}

/// The contracts the running deployment is wired to, in the order the page
/// reads best: money first, market plumbing last.
///
/// `holdsUsdc` is declared rather than inferred. Calling balanceOf on a
/// registry would return a real and truthful zero, and a zero rendered beside
/// the vault's balance reads as "empty" rather than "not applicable".
function configuredContracts(): Array<{
  name: string;
  kind: ContractKind;
  address: string | undefined;
  holdsUsdc: boolean;
}> {
  return [
    { name: 'KarwanEscrow', kind: 'settlement', address: config.KARWAN_ESCROW_ADDR, holdsUsdc: true },
    { name: 'KarwanInvoiceRegistry', kind: 'financing', address: config.KARWAN_INVOICE_REGISTRY_ADDR, holdsUsdc: true },
    { name: 'KarwanPOFinancing', kind: 'financing', address: config.KARWAN_PO_FINANCING_ADDR, holdsUsdc: true },
    { name: 'KarwanVault', kind: 'staking', address: config.KARWAN_VAULT_ADDR, holdsUsdc: true },
    { name: 'KarwanTreasury', kind: 'treasury', address: config.KARWAN_TREASURY_CONTRACT_ADDR, holdsUsdc: true },
    { name: 'KarwanYieldDistributor', kind: 'treasury', address: config.KARWAN_YIELD_DISTRIBUTOR_ADDR, holdsUsdc: true },
    { name: 'KarwanJobBoard', kind: 'registry', address: config.KARWAN_JOBBOARD_ADDR, holdsUsdc: false },
    { name: 'KarwanReputation', kind: 'registry', address: config.KARWAN_REPUTATION_ADDR, holdsUsdc: false },
    { name: 'KarwanBusinessRegistry', kind: 'registry', address: config.KARWAN_BUSINESS_REGISTRY_ADDR, holdsUsdc: false },
  ];
}

interface Persisted {
  value: CurrentContractsSnapshot;
  builtAt: number;
}

let cached: Persisted | null = null;
let refreshing = false;
let hydrated = false;

async function readOne(
  entry: { name: string; kind: ContractKind; address: string; holdsUsdc: boolean },
): Promise<CurrentContract> {
  const address = entry.address.toLowerCase() as `0x${string}`;

  const ledgerRows = DEPLOY_LEDGER.filter((c) => c.name === entry.name);
  const mine = ledgerRows.find((c) => c.address.toLowerCase() === address);
  // Every deployment of this contract that landed before the live one. Counted
  // from the ledger rather than from the array length, so an address the ledger
  // does not know reports zero rather than an invented history.
  const superseded = mine
    ? ledgerRows.filter((c) => c.deployBlock < mine.deployBlock).length
    : 0;

  const [code, balance] = await Promise.all([
    publicClient.getCode({ address }).catch(() => undefined),
    entry.holdsUsdc
      ? publicClient
          .readContract({
            address: config.USDC_ADDR as `0x${string}`,
            abi: erc20Abi,
            functionName: 'balanceOf',
            args: [address],
          })
          .catch(() => null)
      : Promise.resolve(null),
  ]);

  return {
    name: entry.name,
    kind: entry.kind,
    address,
    deployBlock: mine ? mine.deployBlock.toString() : null,
    live: !!code && code !== '0x',
    usdcBalance: balance === null ? null : formatUnits(balance as bigint, USDC_DECIMALS),
    supersededGenerations: superseded,
  };
}

export async function rebuildCurrentContracts(): Promise<CurrentContractsSnapshot> {
  const entries = configuredContracts().filter(
    (e): e is typeof e & { address: string } => !!e.address,
  );

  const [atBlock, contracts] = await Promise.all([
    publicClient.getBlockNumber(),
    Promise.all(entries.map(readOne)),
  ]);

  // Summed in base units off the formatted strings would round; summed here off
  // the same decimal strings keeps the total equal to the column above it,
  // which is the only property a reader will actually check.
  const custodied = contracts.reduce((total, c) => {
    if (c.usdcBalance === null) return total;
    const [whole = '0', frac = ''] = c.usdcBalance.split('.');
    return total + BigInt(whole) * 1_000_000n + BigInt(frac.padEnd(6, '0').slice(0, 6));
  }, 0n);

  const value: CurrentContractsSnapshot = {
    chainId: publicClient.chain?.id ?? 0,
    atBlock: atBlock.toString(),
    contracts,
    totals: {
      live: contracts.filter((c) => c.live).length,
      configured: contracts.length,
      custodiedUsdc: formatUnits(custodied, USDC_DECIMALS),
    },
    readAt: Date.now(),
  };

  cached = { value, builtAt: Date.now() };
  persist(cached);
  return value;
}

function persist(snapshot: Persisted): void {
  try {
    mkdirSync(dirname(STATE_PATH), { recursive: true });
    writeFileSync(STATE_PATH, JSON.stringify(snapshot), 'utf8');
  } catch (err) {
    logger.warn({ err: (err as Error).message }, 'current contracts: disk persist failed');
  }
  if (pgEnabled) {
    const now = Date.now();
    void db()
      .insert(appSnapshots)
      .values({ key: SNAPSHOT_KEY, data: snapshot, updatedAt: now })
      .onConflictDoUpdate({ target: appSnapshots.key, set: { data: snapshot, updatedAt: now } })
      .catch(() => {
        /* disk + memory keep serving */
      });
  }
}

async function hydrate(): Promise<void> {
  if (hydrated || cached) return;
  hydrated = true;
  try {
    if (existsSync(STATE_PATH)) {
      const parsed = JSON.parse(readFileSync(STATE_PATH, 'utf8')) as Persisted | null;
      if (parsed?.value) {
        cached = parsed;
        return;
      }
    }
  } catch (err) {
    logger.warn({ err: (err as Error).message }, 'current contracts: disk hydrate failed');
  }
  if (!pgEnabled) return;
  try {
    const rows = await db().select().from(appSnapshots).where(eq(appSnapshots.key, SNAPSHOT_KEY));
    const snap = rows[0]?.data as Persisted | undefined;
    if (snap?.value) cached = snap;
  } catch (err) {
    logger.warn({ err: (err as Error).message }, 'current contracts: pg hydrate failed');
  }
}

/// Serve what we have, refresh behind the request when it is old.
///
/// Unlike the lifetime sweep this build is cheap, a handful of parallel reads,
/// so a cold cache builds inline rather than reporting "not scanned yet". There
/// is nothing to seed and no ops step to forget.
export async function getCurrentContracts(force = false): Promise<CurrentContractsSnapshot> {
  await hydrate();

  if (!cached || force) return rebuildCurrentContracts();

  if (!refreshing && Date.now() - cached.builtAt > SERVE_TTL_MS) {
    refreshing = true;
    void rebuildCurrentContracts()
      .catch((err) =>
        logger.warn({ err: (err as Error).message }, 'current contracts refresh failed'),
      )
      .finally(() => {
        refreshing = false;
      });
  }
  return cached.value;
}

/// The daily clock. Started from index.ts alongside the other watchers rather
/// than installed as a system cron: the GCE image this runs on ships without
/// cron, and a schedule that lives in the process cannot be lost by rebuilding
/// the box.
export function startCurrentContractsWatcher(): () => void {
  const tick = () => {
    void rebuildCurrentContracts().catch((err) =>
      logger.warn({ err: (err as Error).message }, 'current contracts: scheduled refresh failed'),
    );
  };
  // Not on boot: the first request builds it, and a restart loop should not
  // mean a burst of chain reads. The timer is the floor, not the only path.
  const timer = setInterval(tick, REFRESH_EVERY_MS);
  timer.unref?.();
  logger.info({ everyMs: REFRESH_EVERY_MS }, 'current contracts watcher started');
  return () => clearInterval(timer);
}

/// Test seam.
export function __resetCurrentContractsForTest(): void {
  cached = null;
  hydrated = false;
  refreshing = false;
}
