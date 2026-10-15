import {
  createPublicClient,
  createWalletClient,
  defineChain,
  encodeAbiParameters,
  http,
  keccak256,
  parseAbi,
  parseAbiParameters,
  type Address,
  type Hex,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { logger } from '../logger.js';
import { createCreRoutes } from '../routes/cre.js';
import { createX402CreRoutes, type FeeAuthorization } from '../routes/x402Cre.js';
import { createGatewayClient } from './gateway.js';
import { adapterAbi, agreementAbi } from './shared/suiteAbi.js';
import { createRegistryReader, verifyDonReport } from './reportVerify.js';
import { parseCreSettings, type CreSettings } from './settings.js';
import { createMemoryCreStore, createSqlCreStore, type CreStore } from './store.js';

type ReadContract = (input: { address: string; functionName: string; args: readonly unknown[] }) => Promise<unknown>;

/// A result claimed as attested is confirmed from the adapter's own record of
/// the verdict for the deal's verifier, not from logs: Arc's RPC returns an
/// empty list for wide log windows, and a contract read is exact.
export function makeCheckApproved(read: ReadContract, adapter: string) {
  return async (input: { family: string; dealId: string; revision: number; evidenceHash: string; pass: boolean }): Promise<boolean> => {
    try {
      const terms = (await read({ address: input.family, functionName: 'getTerms', args: [input.dealId] })) as { verifier: string };
      const key = await read({ address: adapter, functionName: 'verdictKey', args: [terms.verifier, input.family, input.dealId, input.revision] });
      const [set, pass, evidenceHash] = (await read({ address: adapter, functionName: 'verdictOf', args: [key] })) as readonly [boolean, boolean, string];
      return set && pass === input.pass && evidenceHash.toLowerCase() === input.evidenceHash.toLowerCase();
    } catch {
      return false;
    }
  };
}

/// The deal role of the person a wallet belongs to. The buyer is the identity
/// recorded at funding (payerId), so an agent wallet bound to the same person
/// counts; the seller is the identity of terms.seller.
export function makePartyOf(read: ReadContract, identityRegistry: string) {
  return async (wallet: string, family: string, dealId: string): Promise<'buyer' | 'seller' | null> => {
    try {
      const id = (await read({ address: identityRegistry, functionName: 'identityOf', args: [wallet] })) as bigint;
      if (!id) return null;
      const account = (await read({ address: family, functionName: 'accountOf', args: [dealId] })) as { payerId: bigint };
      if (account.payerId === id) return 'buyer';
      const terms = (await read({ address: family, functionName: 'getTerms', args: [dealId] })) as { seller: string };
      const sellerId = (await read({ address: identityRegistry, functionName: 'identityOf', args: [terms.seller] })) as bigint;
      return sellerId === id ? 'seller' : null;
    } catch {
      return null;
    }
  };
}

const FEE_OPEN = 1;

/// A fee payment counts once Arc shows its run open. The run id is keyed as
/// the contract keys it, and a run another relayer opened first still counts.
export function makeOpenFee(chain: { submit(a: FeeAuthorization): Promise<void>; runState(runId: Hex): Promise<number> }) {
  return async (a: FeeAuthorization): Promise<{ runId: string } | { error: string }> => {
    const runId = keccak256(encodeAbiParameters(parseAbiParameters('address, bytes32'), [a.from as Address, a.nonce as Hex]));
    let reason = 'not open';
    try {
      await chain.submit(a);
    } catch (err) {
      reason = err instanceof Error ? err.message : String(err);
    }
    try {
      if ((await chain.runState(runId)) === FEE_OPEN) return { runId };
    } catch (err) {
      reason = err instanceof Error ? err.message : String(err);
    }
    return { error: reason };
  };
}

const feesAbi = parseAbi([
  'function open(address from, uint256 value, uint256 validAfter, uint256 validBefore, bytes32 nonce, bytes signature) returns (bytes32)',
  'function runs(bytes32 runId) view returns (address payer, uint64 openedAt, uint8 state, uint256 amount)',
]);

const ARC_TESTNET_ID = 5_042_002;
const ARC_USDC = '0x3600000000000000000000000000000000000000';

const suiteViews = parseAbi([
  'struct DealAccount { address asset; uint64 horizon; uint8 payeeCount; bool closed; uint8 consentMask; bool valued; address payer; uint64 payerId; uint16 feeBps; uint16 yieldBps; address feeRecipient; uint64 holdUntil; address seniorSafe; uint64 holdUsed; uint128 perDealCap; uint128 funded; uint128 balance; uint128 feePaid; uint128 promised; uint128 recordValue; }',
  'function accountOf(bytes32 dealId) view returns (DealAccount)',
  'function identityOf(address wallet) view returns (uint64)',
]);

async function storeFor(): Promise<CreStore> {
  const client = await import('../db/client.js');
  return client.pgEnabled ? createSqlCreStore(client.postgresExecutor()) : createMemoryCreStore();
}

/// The /api/x402/cre routes, or null while the suite module or the check
/// workflow is not configured.
export async function x402CreRoutesFromEnv(env: Record<string, string | undefined> = process.env) {
  const settings = parseCreSettings(env);
  if (
    !settings.suiteEnabled || !settings.checkWorkflowId || !settings.gatewaySignerKey || !settings.adapter || !settings.identity
    || !settings.fees || !settings.relayerKey
  ) return null;
  const { requirePayment } = await import('../x402/sellerFacilitator.js');
  const store = await storeFor();
  const rpc = settings.arcRpcUrl ?? 'https://rpc.testnet.arc.network';
  const chain = defineChain({
    id: ARC_TESTNET_ID,
    name: 'Arc Testnet',
    nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 18 },
    rpcUrls: { default: { http: [rpc] } },
  });
  const arc = createPublicClient({ chain, transport: http(rpc) });
  const relayer = createWalletClient({ chain, account: privateKeyToAccount(settings.relayerKey as Hex), transport: http(rpc) });
  const fees = settings.fees as Address;
  const abi = [...agreementAbi, ...adapterAbi, ...suiteViews];
  const read: ReadContract = (input) =>
    arc.readContract({ address: input.address as Address, abi, functionName: input.functionName as 'getTerms', args: input.args as [Hex] });
  const gateway = createGatewayClient({
    url: settings.gatewayUrl,
    signerKey: settings.gatewaySignerKey,
    now: () => Date.now(),
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    fetch: (url, init) => fetch(url, init),
  });
  const checkWorkflowId = settings.checkWorkflowId;
  return createX402CreRoutes({
    store,
    charge: requirePayment,
    partyOf: makePartyOf(read, settings.identity),
    dealVerifier: async (family, dealId) => {
      try {
        const t = (await read({ address: family, functionName: 'getTerms', args: [dealId] })) as { verifier: string; seller: string };
        return /^0x0{40}$/i.test(t.seller) ? null : t.verifier;
      } catch {
        return null;
      }
    },
    creVerifiers: [settings.verifierK, settings.verifierCK].filter((v): v is string => !!v),
    fee: { contract: fees, usdc: ARC_USDC, network: `eip155:${ARC_TESTNET_ID}`, amountAtomic: '250000', refundAfterSec: 3600 },
    openFee: makeOpenFee({
      submit: async (a) => {
        const hash = await relayer.writeContract({
          address: fees,
          abi: feesAbi,
          functionName: 'open',
          args: [a.from as Address, BigInt(a.value), BigInt(a.validAfter), BigInt(a.validBefore), a.nonce as Hex, a.signature as Hex],
        });
        const receipt = await arc.waitForTransactionReceipt({ hash });
        if (receipt.status !== 'success') throw new Error(`open reverted in ${hash}`);
      },
      runState: async (runId) => {
        const [, , state] = await arc.readContract({ address: fees, abi: feesAbi, functionName: 'runs', args: [runId] });
        return state;
      },
    }),
    start: (input) => gateway.start(checkWorkflowId, input),
    now: () => Date.now(),
    adapter: settings.adapter,
  });
}

/// The /api/cre routes, or null while the suite module is off.
export async function creRoutesFromEnv(env: Record<string, string | undefined> = process.env) {
  const settings: CreSettings = parseCreSettings(env);
  if (!settings.suiteEnabled) return null;
  const store = await storeFor();
  const arc = createPublicClient({ transport: http(settings.arcRpcUrl ?? 'https://rpc.testnet.arc.network') });
  const abi = [...agreementAbi, ...adapterAbi];
  const read: ReadContract = (input) =>
    arc.readContract({ address: input.address as Address, abi, functionName: input.functionName as 'getTerms', args: input.args as [Hex] });
  const readDon = settings.registryRpcUrl ? createRegistryReader(settings.registryRpcUrl) : async () => {
    throw new Error('CRE_REGISTRY_RPC_URL unset');
  };
  return createCreRoutes({
    store,
    token: settings.workflowToken,
    now: () => Date.now(),
    checkApprovedOnChain: settings.adapter ? makeCheckApproved(read, settings.adapter) : async () => false,
    workflows: {
      check: settings.checkWorkflowId ? [settings.checkWorkflowId] : [],
      risk: settings.riskWorkflowId ? [settings.riskWorkflowId] : [],
    },
    verifyReport: (report) =>
      verifyDonReport(report, {
        readDon,
        workflowIds: new Set([settings.checkWorkflowId, settings.riskWorkflowId, ...settings.workflowIds].filter((w): w is string => !!w)),
        workflowOwner: settings.workflowOwner ?? '',
        trust: settings.reportTrust,
        production: settings.production,
      }),
    notify: async (alerts) => {
      logger.warn({ alerts }, 'CRE risk alerts');
    },
  });
}
