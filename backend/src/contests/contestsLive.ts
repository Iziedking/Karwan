import { randomBytes } from 'node:crypto';
import { createWalletClient, erc20Abi, keccak256, parseAbi, toBytes, type Address, type Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { arcChain, arcTransport, publicClient } from '../chain/client.js';
import { usdc } from '../chain/contracts.js';
import { jobEscrowAbi, proveAwarded, proveEntered, proveOpened, proveRefunded, withHalfFee } from '../chain/jobEscrow.js';
import { suiteJobsAddress } from '../chain/suiteConfig.js';
import { deterministicIdempotencyKey, executeContractCall } from '../chain/txs.js';
import { config } from '../config.js';
import { getAgentWallets } from '../db/agentWallets.js';
import { contestsStore } from '../db/contests.js';
import { bus, type KarwanEventType } from '../events.js';
import { registryAbi } from '../identity/suiteIdentity.js';
import { suiteIdentity } from '../identity/suiteIdentityLive.js';
import { logger } from '../logger.js';
import { settleKey } from '../money/familyFinancingRunner.js';
import { moneyOutGuard } from '../moneyOut/live.js';
import { refusalBody } from '../moneyOut/refusal.js';
import { createContests, type ContestChain, type ContestPorts } from './contests.js';
import { entryFiles, entryPreviews } from './entryFiles.js';

/// The contests core bound to Arc, Circle and the contests tables. Null where
/// the job escrow is not set up on this network.

const hubAbi = parseAbi([
  'struct OpeningConfig { bool open; uint16 feeBps; address feeRecipient; uint128 perDealCap; uint128 highValue; address reviewSafe; address seniorSafe; address autoArbiter; uint16 yieldBps; }',
  'function openingConfig(address family, address asset) view returns (OpeningConfig)',
]);

const receiptOf = (hash: Hex) => publicClient.waitForTransactionReceipt({ hash });
/// Opening a contest keeps one key per contest, so a retry never holds a second
/// prize. Later steps take a fresh key: the core's lock and the contract's own
/// state stop a double, and a failed step can be tried again.
const once = () => randomBytes(6).toString('hex');

function chainFor(jobs: Hex, asset: Hex): ContestChain {
  const send = async (walletId: string, call: { sig: string; params: unknown[]; key: string }, to: Hex = jobs) =>
    (await executeContractCall(
      { walletId, contractAddress: to, abiFunctionSignature: call.sig, abiParameters: call.params as never, idempotencyKey: deterministicIdempotencyKey(call.key) },
      `contest.${call.sig.split('(')[0]}`,
    )).txHash as Hex;

  return {
    async open(walletId, t) {
      const ref = `${t.client}:${t.entriesBy}:${keccak256(toBytes(t.description))}`;
      await send(walletId, { sig: 'approve(address,uint256)', params: [jobs, withHalfFee(t.prize, t.feeBps).toString()], key: `contest:${ref}:approve` }, asset);
      const txHash = await send(walletId, {
        sig: 'openBounty((address,uint128,uint64,uint64,uint16[],string))',
        params: [[t.evaluator, t.prize.toString(), t.entriesBy.toString(), t.awardBy.toString(), t.shares.map(String), t.description]],
        key: `contest:${ref}:open`,
      });
      const jobId = proveOpened(await receiptOf(txHash), { jobs, client: t.client, evaluator: t.evaluator, prize: t.prize, entriesBy: t.entriesBy, awardBy: t.awardBy });
      return { jobId, txHash };
    },
    async enter(walletId, jobId, fingerprint, entrant) {
      const txHash = await send(walletId, { sig: 'enter(uint256,bytes32)', params: [jobId.toString(), fingerprint], key: `contest:${jobId}:enter:${fingerprint}:${once()}` });
      proveEntered(await receiptOf(txHash), { jobs, jobId, entrant, deliverable: fingerprint });
      return txHash;
    },
    async award(walletId, jobId, winners, net) {
      const txHash = await send(walletId, { sig: 'award(uint256,address[])', params: [jobId.toString(), winners], key: `contest:${jobId}:award:${once()}` });
      proveAwarded(await receiptOf(txHash), { jobs, jobId, winners, net });
      return txHash;
    },
    async cancel(walletId, jobId, client) {
      const txHash = await send(walletId, { sig: 'reject(uint256,bytes32,bytes)', params: [jobId.toString(), keccak256(toBytes('taken back')), '0x'], key: `contest:${jobId}:cancel:${once()}` });
      return { txHash, back: proveRefunded(await receiptOf(txHash), { jobs, jobId, client }) };
    },
    async giveBack(jobId, client) {
      // Anyone may return a prize past its award date; Karwan's operator pays the gas.
      const key = settleKey(config);
      if (!key) throw new Error('no operator key to return the prize');
      const wallet = createWalletClient({ account: privateKeyToAccount(key), chain: arcChain, transport: arcTransport });
      const txHash = await wallet.writeContract({ address: jobs, abi: jobEscrowAbi, functionName: 'claimRefund', args: [jobId] });
      return { txHash, back: proveRefunded(await receiptOf(txHash), { jobs, jobId, client }) };
    },
  };
}

function bind(): ContestPorts | null {
  const jobs = suiteJobsAddress();
  const identityAddr = config.KARWAN_SUITE_IDENTITY_ADDR as Hex | undefined;
  const hub = config.KARWAN_SUITE_HUB_ADDR as Hex | undefined;
  if (!jobs || !identityAddr || !hub) return null;
  const asset = usdc as Hex;
  return {
    store: contestsStore,
    saveEntryFiles: (id, files) => entryFiles.saveFiles(id, files),
    savePreview: (id, photo) => {
      entryPreviews.save(id, [photo], Date.now());
    },
    openingConfig: async () => {
      const c = await publicClient.readContract({ address: hub, abi: hubAbi, functionName: 'openingConfig', args: [jobs, asset] });
      return { open: c.open, feeBps: c.feeBps, perDealCap: c.perDealCap };
    },
    buyerAgentFor: async (buyer) => {
      const w = await getAgentWallets(buyer);
      if (!w?.buyerWalletId) return null;
      // The outcome lands on the buyer's record only once it is set up.
      await suiteIdentity?.ensureRecord(buyer, 'buyer').catch((err) => logger.warn({ buyer, err: (err as Error).message }, 'contest: buyer record not ready'));
      return { walletId: w.buyerWalletId, address: w.buyerAddress as Address };
    },
    sellerAgentFor: async (seller) => {
      const w = await getAgentWallets(seller);
      if (!w?.sellerWalletId) return null;
      await suiteIdentity?.ensureRecord(seller, 'seller').catch((err) => logger.warn({ seller, err: (err as Error).message }, 'contest: seller record not ready'));
      return { walletId: w.sellerWalletId, address: w.sellerAddress as Address };
    },
    identityOf: (wallet) => publicClient.readContract({ address: identityAddr, abi: registryAbi, functionName: 'identityOf', args: [wallet] }) as Promise<bigint>,
    balanceOf: (wallet) => publicClient.readContract({ address: asset, abi: erc20Abi, functionName: 'balanceOf', args: [wallet] }),
    guard: async (buyer, amountMicros, reference) => {
      const pass = await moneyOutGuard.check({ wallet: buyer, exit: { kind: 'escrow' }, amountMicros, reference });
      if (pass.ok) return { ok: true };
      const body = refusalBody(pass.refusal);
      return { ok: false, code: body.code, message: body.error };
    },
    chain: chainFor(jobs, asset),
    tell: (kind, payload) => bus.emitEvent({ type: kind as KarwanEventType, actor: 'platform', payload }),
    now: () => Date.now(),
    newId: (prefix) => `${prefix}_${randomBytes(9).toString('base64url')}`,
  };
}

export const contestPorts = bind();
export const contests = contestPorts ? createContests(contestPorts) : null;
