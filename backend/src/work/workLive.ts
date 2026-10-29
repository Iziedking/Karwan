import { randomBytes } from 'node:crypto';
import { createWalletClient, erc20Abi, parseAbi, toHex, type Address, type Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { arcChain, arcTransport, publicClient } from '../chain/client.js';
import { usdc } from '../chain/contracts.js';
import { suiteTimeAddress } from '../chain/suiteConfig.js';
import {
  proveAccepted,
  proveApproved,
  proveCancelled,
  proveClosed,
  proveFunded,
  proveNotice,
  proveObjected,
  proveOffered,
  proveSettled,
  proveSubmitted,
  timeEscrowAbi,
  timeTermsHash,
  weekCost,
  type TimeTermsT,
} from '../chain/timeEscrow.js';
import { deterministicIdempotencyKey, executeContractCall } from '../chain/txs.js';
import { config } from '../config.js';
import { getAgentWallets } from '../db/agentWallets.js';
import { engagementsStore } from '../db/engagements.js';
import { findProfileByHandle, getProfile } from '../db/profiles.js';
import { findTelegramAccountByUsername } from '../db/telegramAccounts.js';
import { bus, type KarwanEventType } from '../events.js';
import { registryAbi } from '../identity/suiteIdentity.js';
import { suiteIdentity } from '../identity/suiteIdentityLive.js';
import { logger } from '../logger.js';
import { resolveLookup } from '../lookup/resolve.js';
import { settleKey } from '../money/familyFinancingRunner.js';
import { moneyOutGuard } from '../moneyOut/live.js';
import { refusalBody } from '../moneyOut/refusal.js';
import { createEngagements, type WorkChain, type WorkPorts } from './engagements.js';

/// The hourly-work core bound to Arc, Circle and the engagements table. Null
/// where the time escrow is not set up on this network.

const hubAbi = parseAbi([
  'struct OpeningConfig { bool open; uint16 feeBps; address feeRecipient; uint128 perDealCap; uint128 highValue; address reviewSafe; address seniorSafe; address autoArbiter; uint16 yieldBps; }',
  'function openingConfig(address family, address asset) view returns (OpeningConfig)',
]);

const receiptOf = (hash: Hex) => publicClient.waitForTransactionReceipt({ hash });
/// Opening keeps one key per engagement salt, so a retry never funds a second
/// first week. Later steps take a fresh key: the core's lock and the
/// contract's own state stop a double, and a failed step can be tried again.
const once = () => randomBytes(6).toString('hex');
const TERMS_SIG = '(address,address,uint128,uint32,uint32,uint32,uint16,uint64,uint64,uint32,uint32,uint8,bool,uint16,uint16,bytes32)';
const termsArray = (t: TimeTermsT) => [
  t.asset, t.worker, t.rate.toString(), String(t.unitScale), String(t.maxUnits), String(t.cycleSecs), String(t.cycles),
  t.startsAt.toString(), t.acceptBy.toString(), String(t.claimGrace), String(t.reviewWindow), String(t.noticeCycles),
  t.rollover, String(t.partialBps), String(t.fallbackBps), t.agreementHash,
];

function chainFor(escrow: Hex, asset: Hex): WorkChain {
  const send = async (walletId: string, call: { sig: string; params: unknown[]; key: string }, to: Hex = escrow) =>
    (await executeContractCall(
      { walletId, contractAddress: to, abiFunctionSignature: call.sig, abiParameters: call.params as never, idempotencyKey: deterministicIdempotencyKey(call.key) },
      `work.${call.sig.split('(')[0]}`,
    )).txHash as Hex;
  // Settling, closing and the fallback are open to anyone; Karwan's operator pays the gas.
  const operatorWrite = async (functionName: 'settle' | 'close' | 'applyFallback', args: readonly unknown[]) => {
    const key = settleKey(config);
    if (!key) throw new Error('no operator key to settle hourly work');
    const wallet = createWalletClient({ account: privateKeyToAccount(key), chain: arcChain, transport: arcTransport });
    return wallet.writeContract({ address: escrow, abi: timeEscrowAbi, functionName, args: args as never });
  };

  return {
    async offer(walletId, i) {
      await send(walletId, { sig: 'approve(address,uint256)', params: [escrow, i.total.toString()], key: `work:${i.salt}:approve` }, asset);
      const txHash = await send(walletId, { sig: `open(bytes32,${TERMS_SIG})`, params: [i.salt, termsArray(i.terms)], key: `work:${i.salt}:open` });
      const id = proveOffered(await receiptOf(txHash), { escrow, employer: i.employer, worker: i.terms.worker, termsHash: timeTermsHash(i.terms), total: i.total });
      return { id, txHash };
    },
    async accept(walletId, id, termsHash) {
      const txHash = await send(walletId, { sig: 'accept(bytes32,bytes32)', params: [id, termsHash], key: `work:${id}:accept:${once()}` });
      proveAccepted(await receiptOf(txHash), { escrow, id });
      return txHash;
    },
    async cancel(walletId, id) {
      const txHash = await send(walletId, { sig: 'cancelOffer(bytes32)', params: [id], key: `work:${id}:cancel:${once()}` });
      return { txHash, back: proveCancelled(await receiptOf(txHash), { escrow, id }) };
    },
    async fund(walletId, i) {
      const total = weekCost(i.terms, i.feeBps).total;
      await send(walletId, { sig: 'approve(address,uint256)', params: [escrow, total.toString()], key: `work:${i.id}:${i.k}:approve:${once()}` }, asset);
      const txHash = await send(walletId, { sig: 'fundCycle(bytes32)', params: [i.id], key: `work:${i.id}:${i.k}:fund:${once()}` });
      proveFunded(await receiptOf(txHash), { escrow, id: i.id, k: i.k, total: i.total });
      return txHash;
    },
    async submit(walletId, i) {
      const txHash = await send(walletId, { sig: 'submit(bytes32,uint16,uint32,bytes32)', params: [i.id, String(i.k), String(i.units), i.evidence], key: `work:${i.id}:${i.k}:submit:${once()}` });
      proveSubmitted(await receiptOf(txHash), { escrow, ...i });
      return txHash;
    },
    async approve(walletId, i) {
      const txHash = await send(walletId, { sig: 'approve(bytes32,uint16,uint32)', params: [i.id, String(i.k), String(i.units)], key: `work:${i.id}:${i.k}:approve-hours:${once()}` });
      return { txHash, paid: proveApproved(await receiptOf(txHash), { escrow, ...i }) };
    },
    async object(walletId, i) {
      const txHash = await send(walletId, {
        sig: 'object(bytes32,uint16,uint32,bytes32)', params: [i.id, String(i.k), String(i.units), i.clauseHash], key: `work:${i.id}:${i.k}:object:${once()}`,
      });
      return { txHash, paid: proveObjected(await receiptOf(txHash), { escrow, id: i.id, k: i.k, units: i.units, worker: i.worker }) };
    },
    async notice(walletId, id) {
      const txHash = await send(walletId, { sig: 'giveNotice(bytes32)', params: [id], key: `work:${id}:notice:${once()}` });
      return { txHash, runs: proveNotice(await receiptOf(txHash), { escrow, id }) };
    },
    async settle(i) {
      const txHash = await operatorWrite('settle', [i.id, i.k]);
      return { txHash, ...proveSettled(await receiptOf(txHash), { escrow, ...i }) };
    },
    async fallback(i) {
      const txHash = await operatorWrite('applyFallback', [i.id, i.k]);
      return { txHash, ...proveSettled(await receiptOf(txHash), { escrow, ...i }) };
    },
    async close(id) {
      const txHash = await operatorWrite('close', [id]);
      return { txHash, refunded: proveClosed(await receiptOf(txHash), { escrow, id }).refunded };
    },
    async escalate(i) {
      if (!config.SUITE_ARBITER_KEY) throw new Error('no arbiter key to take the objection to the review team');
      const wallet = createWalletClient({ account: privateKeyToAccount(config.SUITE_ARBITER_KEY as Hex), chain: arcChain, transport: arcTransport });
      const txHash = await wallet.writeContract({ address: escrow, abi: timeEscrowAbi, functionName: 'escalate', args: [i.id, i.k] });
      const receipt = await receiptOf(txHash);
      if (receipt.status !== 'success') throw new Error(`escalate reverted (tx ${txHash})`);
      return txHash;
    },
  };
}

function bind(): WorkPorts | null {
  const escrow = suiteTimeAddress();
  const identityAddr = config.KARWAN_SUITE_IDENTITY_ADDR as Hex | undefined;
  const hub = config.KARWAN_SUITE_HUB_ADDR as Hex | undefined;
  if (!escrow || !identityAddr || !hub) return null;
  const asset = usdc as Hex;
  return {
    store: engagementsStore,
    chain: chainFor(escrow, asset),
    asset,
    openingConfig: async () => {
      const c = await publicClient.readContract({ address: hub, abi: hubAbi, functionName: 'openingConfig', args: [escrow, asset] });
      return { open: c.open, feeBps: c.feeBps, perDealCap: c.perDealCap };
    },
    resolveWorker: async (raw) => {
      const t = raw.trim();
      if (/^0x[0-9a-fA-F]{40}$/.test(t)) return t.toLowerCase() as Address;
      const r = await resolveLookup(t, {
        byTag: async (tag) => (await findProfileByHandle(tag))?.address ?? null,
        byTelegram: async (name) => {
          const account = await findTelegramAccountByUsername(name);
          return account?.address ? { address: account.address, findable: account.findable === true } : null;
        },
      });
      return (r?.address as Address | undefined) ?? null;
    },
    buyerAgentFor: async (user) => {
      const w = await getAgentWallets(user);
      if (!w?.buyerWalletId) return null;
      // The outcome lands on the hirer's record only once it is set up.
      await suiteIdentity?.ensureRecord(user, 'buyer').catch((err) => logger.warn({ user, err: (err as Error).message }, 'work: hirer record not ready'));
      return { walletId: w.buyerWalletId, address: w.buyerAddress as Address };
    },
    sellerAgentFor: async (user) => {
      const w = await getAgentWallets(user);
      if (!w?.sellerWalletId) return null;
      await suiteIdentity?.ensureRecord(user, 'seller').catch((err) => logger.warn({ user, err: (err as Error).message }, 'work: worker record not ready'));
      return { walletId: w.sellerWalletId, address: w.sellerAddress as Address };
    },
    identityOf: (wallet) => publicClient.readContract({ address: identityAddr, abi: registryAbi, functionName: 'identityOf', args: [wallet] }) as Promise<bigint>,
    balanceOf: (wallet) => publicClient.readContract({ address: asset, abi: erc20Abi, functionName: 'balanceOf', args: [wallet] }),
    guard: async (user, amountMicros, reference) => {
      const pass = await moneyOutGuard.check({ wallet: user, exit: { kind: 'escrow' }, amountMicros, reference });
      if (pass.ok) return { ok: true };
      const body = refusalBody(pass.refusal);
      return { ok: false, code: body.code, message: body.error };
    },
    tellPerson: (address, text, workId) => bus.emitEvent({ type: 'work.update', actor: 'platform', payload: { address, text, workId } }),
    emit: (kind, payload) => bus.emitEvent({ type: kind as KarwanEventType, actor: 'platform', payload }),
    now: () => Date.now(),
    newId: (prefix) => `${prefix}_${randomBytes(9).toString('base64url')}`,
    newSalt: () => toHex(randomBytes(32)),
    nameOf: async (address) => {
      const p = await getProfile(address).catch(() => null);
      return p?.handle ? `@${p.handle}` : p?.displayName || 'Someone on Karwan';
    },
  };
}

export const workPorts = bind();
export const work = workPorts ? createEngagements(workPorts) : null;
