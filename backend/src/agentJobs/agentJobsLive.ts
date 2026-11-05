import { createWalletClient, erc20Abi, parseAbi, type Address, type Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { ARC, arcChain, arcTransport, publicClient } from '../chain/client.js';
import { usdc } from '../chain/contracts.js';
import { jobEscrowAbi, proveCompleted } from '../chain/jobEscrow.js';
import { suiteJobsAddress } from '../chain/suiteConfig.js';
import { deterministicIdempotencyKey, executeContractCall } from '../chain/txs.js';
import { config } from '../config.js';
import { agentJobsStore } from '../db/agentJobs.js';
import { getAgentWallets } from '../db/agentWallets.js';
import { findProfileByHandle } from '../db/profiles.js';
import { bus } from '../events.js';
import { suiteIdentity } from '../identity/suiteIdentityLive.js';
import { logger } from '../logger.js';
import { worldIdAccountSessions } from '../routes/worldId.js';
import { createAgentJobs, type AgentJobsPorts } from './agentJobs.js';

/// The outside-agent jobs core bound to Arc, Circle and Postgres. Null unless
/// this is Arc Testnet with the job escrow and Karwan's reviewer key set.

const hubAbi = parseAbi([
  'struct OpeningConfig { bool open; uint16 feeBps; address feeRecipient; uint128 perDealCap; uint128 highValue; address reviewSafe; address seniorSafe; address autoArbiter; uint16 yieldBps; }',
  'function openingConfig(address family, address asset) view returns (OpeningConfig)',
]);

const NOTES: Record<'agent_job.funded' | 'agent_job.completed' | 'agent_job.rejected' | 'agent_job.refunded', (work: string, amount: string) => string> = {
  'agent_job.funded': (w, a) => `A deal funded by an agent for a verified person: ${w}, ${a} USDC. Mark it delivered when it is done.`,
  'agent_job.completed': (w, a) => `You were paid ${a} USDC for ${w}.`,
  'agent_job.rejected': (w) => `The buyer was not happy with ${w}. You have 3 days to dispute from the deal page.`,
  'agent_job.refunded': (w) => `The money for ${w} went back to the buyer.`,
};

const sessionsFor = () => {
  const s = worldIdAccountSessions();
  if (!s) throw Object.assign(new Error('World ID is unavailable. Try again shortly.'), { code: 'WORLD_ID_UNAVAILABLE' });
  return s;
};

function bind(): AgentJobsPorts | null {
  const jobs = suiteJobsAddress();
  const hub = config.KARWAN_SUITE_HUB_ADDR as Hex | undefined;
  const key = config.KARWAN_JOB_EVALUATOR_KEY as Hex | undefined;
  if (!ARC.testnet || !jobs || !hub || !key) return null;
  const asset = usdc as Hex;
  const evaluator = createWalletClient({ account: privateKeyToAccount(key), chain: arcChain, transport: arcTransport });
  const wait = (hash: Hex) => publicClient.waitForTransactionReceipt({ hash });
  const write = async (functionName: 'complete' | 'reject' | 'release' | 'confirmRejection', args: readonly unknown[]) =>
    evaluator.writeContract({ address: jobs, abi: jobEscrowAbi, functionName, args: args as never });

  const sellerSend = async (account: string, sig: string, params: unknown[], seed: string) => {
    const w = await getAgentWallets(account);
    if (!w?.sellerWalletId) throw new Error('the seller has no selling agent wallet');
    const { txHash } = await executeContractCall(
      { walletId: w.sellerWalletId, contractAddress: jobs, abiFunctionSignature: sig, abiParameters: params as never, idempotencyKey: deterministicIdempotencyKey(seed) },
      `agentJob.${sig.split('(')[0]}`,
    );
    await wait(txHash as Hex);
    return txHash as Hex;
  };

  return {
    store: agentJobsStore,
    jobs,
    usdc: asset,
    evaluator: evaluator.account.address,
    frontendBase: (config.FRONTEND_BASE_URL ?? 'https://karwan.site').replace(/\/$/, ''),
    async seller(tag) {
      const profile = await findProfileByHandle(tag);
      if (!profile?.address) return null;
      const w = await getAgentWallets(profile.address);
      if (w?.sellerAddress) {
        // The outcome lands on the seller's record only once it is set up.
        await suiteIdentity?.ensureRecord(profile.address, 'seller').catch((err) => logger.warn({ err: (err as Error).message }, 'agent job: seller record not ready'));
      }
      return {
        account: profile.address,
        tag: profile.handle ?? tag,
        provider: w?.sellerAddress ?? null,
        acceptsOutsideAgents: profile.settings?.acceptsOutsideAgents !== false,
      };
    },
    async openingConfig() {
      const c = await publicClient.readContract({ address: hub, abi: hubAbi, functionName: 'openingConfig', args: [jobs, asset] });
      return { open: c.open, feeBps: c.feeBps, perDealCap: c.perDealCap };
    },
    receipt: (hash) => publicClient.getTransactionReceipt({ hash }).catch(() => null),
    async readJob(id) {
      const j = await publicClient.readContract({ address: jobs, abi: jobEscrowAbi, functionName: 'jobOf', args: [id] });
      return {
        status: j.status, client: j.client, provider: j.provider, evaluator: j.evaluator, budget: j.budget,
        expiredAt: j.expiredAt, submittedAt: j.submittedAt, rejectedAt: j.rejectedAt, reviewWindow: j.reviewWindow, disputed: j.disputed,
      };
    },
    usdcBalance: (address) => publicClient.readContract({ address: asset, abi: erc20Abi, functionName: 'balanceOf', args: [address as Address] }),
    person: {
      request: (k, purpose) => sessionsFor().request(k, purpose),
      verify: async (k, purpose, result) => {
        await sessionsFor().verify(k, purpose, result);
      },
      session: (k) => sessionsFor().session(k),
    },
    evaluatorCalls: {
      async complete(id, reason) {
        const tx = await write('complete', [id, reason, '0x']);
        proveCompleted(await wait(tx), { jobs, jobId: id, provider: (await publicClient.readContract({ address: jobs, abi: jobEscrowAbi, functionName: 'jobOf', args: [id] })).provider });
        return tx;
      },
      async reject(id, reason) {
        const tx = await write('reject', [id, reason, '0x']);
        if ((await wait(tx)).status !== 'success') throw new Error('the rejection reverted');
        return tx;
      },
    },
    anyoneCalls: {
      async release(id) {
        const tx = await write('release', [id]);
        if ((await wait(tx)).status !== 'success') throw new Error('the release reverted');
        return tx;
      },
      async confirmRejection(id) {
        const tx = await write('confirmRejection', [id]);
        if ((await wait(tx)).status !== 'success') throw new Error('the refund reverted');
        return tx;
      },
    },
    sellerAgent: {
      submit: (account, id, deliverable) => sellerSend(account, 'submit(uint256,bytes32,bytes)', [id.toString(), deliverable, '0x'], `agentJob:${id}:submit:${deliverable}`),
      dispute: (account, id, clause) => sellerSend(account, 'disputeRejection(uint256,bytes32)', [id.toString(), clause], `agentJob:${id}:dispute`),
    },
    async notify(account, e) {
      bus.emitEvent({ type: 'work.update', actor: 'platform', payload: { address: account, text: NOTES[e.type](e.work, e.amountUsdc), path: `/agent-jobs/${e.ref}` } });
    },
  };
}

export const agentJobsPorts = bind();
export const agentJobs = agentJobsPorts ? createAgentJobs(agentJobsPorts) : null;
