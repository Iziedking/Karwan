import { readFileSync } from 'node:fs';
import {
  createPublicClient,
  createTestClient,
  createWalletClient,
  decodeEventLog,
  defineChain,
  erc20Abi,
  hashTypedData,
  http,
  parseAbi,
  parseAbiItem,
  type AbiFunction,
  type AbiParameter,
  type Hex,
  type LocalAccount,
} from 'viem';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { fundAgentMatchSuite } from '../agents/fundAgentMatchSuite.js';
import { runSuiteDispute, type SuiteWatcherDeps } from '../agents/suiteDisputeWatcher.js';
import { agreementEscrowAbi } from '../chain/abis/agreementEscrow.js';
import { createAgreementEscrow } from '../chain/agreementEscrow.js';
import { agreementEscrowPorts, createAgreementReads, readAgreementLimits } from '../chain/agreementEscrowReads.js';
import { agreementDealId, agreementTermsHash, buildAgreementTerms, buyerPaysMicros, storeAgreementTerms } from '../chain/agreementTerms.js';
import { DEAL_STATE } from '../chain/dealEscrowV3.js';
import { createPlatformSigners, type PlatformTarget } from '../chain/platformSigners.js';
import type { DirectDeal } from '../db/deals.js';
import { CHECK_POLICY_V1 } from '../deals/fundDirectV3.js';
import { createSuiteEarnings, type EarningsMove } from '../deals/suiteEarnings.js';
import { bindingTypedData, createSuiteIdentity, KIND, registryAbi } from '../identity/suiteIdentity.js';

/// The escrow-family path end to end on an Arc fork of the deployed suite
/// (plan 2, Task 13), with the backend's own adapters and local keys in place
/// of Circle. Run through scripts/ops/arc-fork.sh e2e:
///   parity   the backend's hashes, ids and digests against the contracts
///   full     parity, then record setup, a one-time deal, earnings, a checked
///            deal passed by two checkers, and a dispute carried out after 72 h
/// Reads FORK_RPC_URL. The full run also needs the hub configured (the owner's
/// timelock batch executed before the fork block) and FORK_CHECKER_KEYS,
/// FORK_ARBITER_KEY, FORK_ISSUER_KEY, the testnet role keys, piped in and
/// never printed.

const phase = process.argv[2] ?? 'parity';
const RPC = process.env.FORK_RPC_URL ?? 'http://127.0.0.1:8548';
const CHAIN_ID = 5042002;
const USDC = '0x3600000000000000000000000000000000000000' as Hex;
const DAY = 86_400;
const D = JSON.parse(readFileSync(new URL('../../../contracts/deployments/endgame-5042002.json', import.meta.url), 'utf8')) as Record<string, Hex>;

const chain = defineChain({
  id: CHAIN_ID,
  name: 'Arc fork',
  nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 18 },
  rpcUrls: { default: { http: [RPC] } },
});
const pub = createPublicClient({ chain, transport: http(RPC) });
const anvil = createTestClient({ chain, mode: 'anvil', transport: http(RPC) });
const reads = createAgreementReads(pub);

let failed = 0;
function check(name: string, ok: boolean, detail = ''): void {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
  if (!ok) failed += 1;
}

async function chainNow(): Promise<number> {
  return Number((await pub.getBlock()).timestamp);
}

async function warp(secs: number): Promise<void> {
  await anvil.increaseTime({ seconds: secs });
  await anvil.mine({ blocks: 1 });
}

const verifierAbi = parseAbi([
  'function reportDigest(address family, bytes32 dealId, uint32 revision, bool pass, bytes32 evidenceHash) view returns (bytes32)',
  'function report(address family, bytes32 dealId, uint32 revision, bool pass, bytes32 evidenceHash, address[] signers, bytes[] sigs)',
  'event Reported(address indexed family, bytes32 indexed dealId, uint32 revision, bool pass, bytes32 evidenceHash)',
]);
const bindDigestAbi = parseAbi([
  'function bindDigest(uint64 id, address wallet, uint8 kind, uint64 expiry, uint128 perPayment, uint128 total, uint256 deadline) view returns (bytes32)',
]);

async function parity(): Promise<void> {
  const now = await chainNow();
  const limits = { minReview: 3_600, maxReview: 30 * DAY, maxHorizon: 730 * DAY, perDealCapMicros: 1_005_000_000n, feeBps: 100 };
  const terms = buildAgreementTerms(
    {
      kind: 'one_time',
      asset: USDC,
      seller: privateKeyToAccount(generatePrivateKey()).address,
      amountMicros: 250_000_000n,
      acceptBy: BigInt(now + 3 * DAY),
      deliveryDeadline: BigInt(now + 10 * DAY),
      reviewWindowSecs: 3 * DAY,
      reclaimGraceSecs: DAY,
      agreementHash: `0x${'ab'.repeat(32)}`,
      nowSecs: now,
    },
    limits,
  );
  const onChainHash = await reads.termsHashOf(D.agreement!, terms);
  check('terms hash matches termsHashOf', onChainHash === agreementTermsHash(terms), onChainHash);

  const buyer = privateKeyToAccount(generatePrivateKey()).address;
  const salt = `0x${'5a'.repeat(32)}` as Hex;
  const onChainId = await reads.read<Hex>(D.agreement!, 'dealIdFor', [buyer, salt]);
  check('deal id matches dealIdFor', onChainId === agreementDealId({ chainId: CHAIN_ID, escrow: D.agreement!, buyer, salt }), onChainId);

  const wallet = privateKeyToAccount(generatePrivateKey()).address;
  const nonce = await pub.readContract({ address: D.identity!, abi: registryAbi, functionName: 'nonces', args: [wallet] });
  const bind = { identityId: 7n, wallet, kind: KIND.Agent, expiry: BigInt(now + 365 * DAY), perPayment: 1_005_000_000n, total: 10_000_000_000n, deadline: BigInt(now + 3_600) };
  const local = hashTypedData(bindingTypedData({ registry: D.identity!, chainId: CHAIN_ID, nonce, ...bind }));
  const remote = await pub.readContract({
    address: D.identity!,
    abi: bindDigestAbi,
    functionName: 'bindDigest',
    args: [bind.identityId, bind.wallet, bind.kind, bind.expiry, bind.perPayment, bind.total, bind.deadline],
  });
  check('bind digest matches bindDigest', local === remote, remote);

  const report = { family: D.agreement!, dealId: onChainId, revision: 1, pass: true, evidenceHash: `0x${'ee'.repeat(32)}` as Hex };
  const localReport = hashTypedData({
    domain: { name: 'KarwanCheckVerifier', version: '1', chainId: CHAIN_ID, verifyingContract: D.verifier! },
    types: { Report: [{ name: 'family', type: 'address' }, { name: 'dealId', type: 'bytes32' }, { name: 'revision', type: 'uint32' }, { name: 'pass', type: 'bool' }, { name: 'evidenceHash', type: 'bytes32' }] },
    primaryType: 'Report',
    message: report,
  });
  const remoteReport = await pub.readContract({
    address: D.verifier!,
    abi: verifierAbi,
    functionName: 'reportDigest',
    args: [report.family, report.dealId, report.revision, report.pass, report.evidenceHash],
  });
  check('check report digest matches reportDigest', localReport === remoteReport, remoteReport);
}

/// Circle takes ABI parameters as strings; the wallet needs numbers as bigints.
function coerce(params: readonly AbiParameter[], values: readonly unknown[]): unknown[] {
  return params.map((p, i) => coerceOne(p, values[i]));
}
function coerceOne(p: AbiParameter, v: unknown): unknown {
  const array = /^(.*)\[\d*\]$/.exec(p.type);
  if (array) return (v as unknown[]).map((x) => coerceOne({ ...p, type: array[1]! }, x));
  if (p.type === 'tuple') return coerce((p as { components: readonly AbiParameter[] }).components, v as unknown[]);
  if (/^u?int\d*$/.test(p.type)) return BigInt(String(v));
  if (p.type === 'bool') return v === true || v === 'true';
  return v;
}

async function full(): Promise<void> {
  const keyList = (process.env.FORK_CHECKER_KEYS ?? '').split(',').map((k) => k.trim()).filter(Boolean);
  if (keyList.length < 3 || !process.env.FORK_ARBITER_KEY || !process.env.FORK_ISSUER_KEY) {
    check('role keys were piped in', false, 'FORK_CHECKER_KEYS, FORK_ARBITER_KEY and FORK_ISSUER_KEY are needed');
    return;
  }
  const limits = await readAgreementLimits(pub, D.hub!, D.agreement!, USDC);
  check('the hub opens the Agreement family for USDC', limits.perDealCapMicros > 0n, `cap ${limits.perDealCapMicros}, fee ${limits.feeBps} bps`);
  if (limits.perDealCapMicros === 0n) return;

  // Fresh people and agents for every run, funded with test USDC on the fork.
  const accounts: Record<string, LocalAccount> = {};
  for (const id of ['buyer-id', 'buyer-agent', 'buyer-seller-agent', 'seller-id', 'seller-agent', 'seller-buyer-agent', 'arbiter']) {
    accounts[id] = id === 'arbiter' ? privateKeyToAccount(process.env.FORK_ARBITER_KEY as Hex) : privateKeyToAccount(generatePrivateKey());
    await anvil.setBalance({ address: accounts[id]!.address, value: 5_000n * 10n ** 18n });
  }
  const wallet = (id: string) => createWalletClient({ account: accounts[id]!, chain, transport: http(RPC) });
  const sendAs = async (id: string, to: Hex, abi: readonly unknown[], functionName: string, args: unknown[]) => {
    const hash = await wallet(id).writeContract({ address: to, abi: abi as never, functionName: functionName as never, args: args as never, account: accounts[id]!, chain });
    const receipt = await pub.waitForTransactionReceipt({ hash });
    if (receipt.status !== 'success') throw new Error(`${functionName} reverted (${hash})`);
    return hash;
  };
  const balance = (who: Hex) => pub.readContract({ address: USDC, abi: erc20Abi, functionName: 'balanceOf', args: [who] });

  // Identity setup, through the same module the app uses.
  const people: Record<string, { identity: string; buyer: string; seller: string }> = {
    [accounts['buyer-id']!.address.toLowerCase()]: { identity: 'buyer-id', buyer: 'buyer-agent', seller: 'buyer-seller-agent' },
    [accounts['seller-id']!.address.toLowerCase()]: { identity: 'seller-id', buyer: 'seller-buyer-agent', seller: 'seller-agent' },
  };
  let nowSecs = await chainNow();
  const identity = createSuiteIdentity({
    registry: D.identity!,
    chainId: CHAIN_ID,
    now: () => nowSecs,
    binding: async (w) => {
      const [id, kind, expiry] = await pub.readContract({ address: D.identity!, abi: registryAbi, functionName: 'bindingOf', args: [w] });
      return { id: BigInt(id), kind: Number(kind), expiry: BigInt(expiry) };
    },
    nonce: (w) => pub.readContract({ address: D.identity!, abi: registryAbi, functionName: 'nonces', args: [w] }),
    wallets: async (user) => {
      const p = people[user.toLowerCase()];
      if (!p) return null;
      return {
        identity: { address: accounts[p.identity]!.address, walletId: p.identity },
        buyer: { address: accounts[p.buyer]!.address, walletId: p.buyer },
        seller: { address: accounts[p.seller]!.address, walletId: p.seller },
      };
    },
    // The fork's agents are plain key wallets: always able to sign, nothing to deploy.
    ensureWallets: async (user) => {
      const p = people[user.toLowerCase()];
      if (!p) return null;
      return {
        identity: { address: accounts[p.identity]!.address, walletId: p.identity },
        buyer: { address: accounts[p.buyer]!.address, walletId: p.buyer },
        seller: { address: accounts[p.seller]!.address, walletId: p.seller },
      };
    },
    isDeployed: async () => true,
    deployAgent: async () => undefined,
    signTypedData: (walletId, typed) => accounts[walletId]!.signTypedData!(typed),
    execute: async (walletId, fn, args) => ({ txHash: await sendAs(walletId, D.identity!, registryAbi, fn, args) }),
  });
  for (const who of ['buyer-id', 'seller-id']) {
    await identity.setUpIdentityForCustodial(accounts[who]!.address);
    const s = await identity.identityStatus(accounts[who]!.address);
    check(`${who} record set up with both agents bound`, s.identityId !== 0n && s.buyerBound && s.sellerBound, `id ${s.identityId}`);
  }

  // The Agreement escrow adapter, with a wallet in place of Circle.
  const events: Array<{ type: string; jobId?: string; payload?: Record<string, unknown> }> = [];
  const escrow = createAgreementEscrow(
    agreementEscrowPorts(reads, D.agreement!, CHAIN_ID, {
      execute: async (input) => {
        const item = parseAbiItem(`function ${input.abiFunctionSignature}`) as AbiFunction;
        const hash = await wallet(input.walletId).writeContract({
          address: input.contractAddress as Hex,
          abi: [item],
          functionName: item.name,
          args: coerce(item.inputs, input.abiParameters as unknown[]) as never,
          account: accounts[input.walletId]!,
          chain,
        });
        await pub.waitForTransactionReceipt({ hash });
        return { txHash: hash };
      },
      emit: (e) => events.push(e),
    }),
  );
  const readView = (id: Hex) => reads.view(D.agreement!, id);
  const buyerUser = accounts['buyer-id']!.address;
  const sellerUser = accounts['seller-id']!.address;
  const matchDeps = {
    escrow,
    asset: USDC,
    readView,
    readLimits: () => readAgreementLimits(pub, D.hub!, D.agreement!, USDC),
    settings: { baseReviewSecs: limits.minReview, reclaimGraceSecs: DAY },
    requireIdentity: (user: string, role: 'buyer' | 'seller') => identity.requireIdentity(user, role),
    readUsdcAllowance: (owner: Hex, spender: Hex) => pub.readContract({ address: USDC, abi: erc20Abi, functionName: 'allowance', args: [owner, spender] }),
    approveUsdc: async (i: { walletId: string; spender: Hex; amount: bigint }) => {
      await sendAs(i.walletId, USDC, erc20Abi, 'approve', [i.spender, i.amount]);
    },
    now: () => nowSecs * 1000,
  };
  const matched = async (jobId: Hex, priceUnits: bigint, deadlineUnix: number) =>
    fundAgentMatchSuite(matchDeps, {
      jobId,
      buyerUser,
      sellerUser,
      buyerAgent: { walletId: 'buyer-agent', address: accounts['buyer-agent']!.address },
      sellerAgent: { walletId: 'seller-agent', address: accounts['seller-agent']!.address },
      priceUnits,
      milestonePcts: [100],
      deadlineUnix,
      tradeType: 'service',
      agreementHash: `0x${'cd'.repeat(32)}`,
    });

  // 1. A one-time deal: funded, accepted, delivered, released, earnings moved home.
  nowSecs = await chainNow();
  const one = await matched(`0x${'01'.repeat(32)}`, 100_000_000n, nowSecs + 5 * DAY);
  check('one-time deal funded and accepted', one.ok && one.accepted, one.ok ? one.record.escrowDealId : one.reason);
  if (!one.ok) return;
  const oneId = one.record.escrowDealId;
  check('the terms the escrow holds hash to the record', (await readView(oneId)).termsHash === one.record.escrowTermsHash);
  await escrow.markDelivered({ walletId: 'seller-agent', jobId: oneId, proofHash: `0x${'de'.repeat(32)}`, dealKey: 'deal-one' });
  await escrow.release({ walletId: 'buyer-agent', jobId: oneId, dealKey: 'deal-one' });
  const paid = events.find((e) => e.type === 'escrow.milestone.released' && e.jobId === 'deal-one');
  const sellerMicros = BigInt(String(paid?.payload?.sellerMicros ?? 0));
  check('release paid the seller agent', sellerMicros > 0n && (await readView(oneId)).state === DEAL_STATE.Settled, `${sellerMicros}`);

  const deals = new Map<string, { jobId: string; seller: string; escrowVersion: 'suite'; sellerAgentWalletId: string; sellerAgentAddress: string; suiteEarnings?: Record<string, EarningsMove> }>([
    ['deal-one', { jobId: 'deal-one', seller: sellerUser, escrowVersion: 'suite', sellerAgentWalletId: 'seller-agent', sellerAgentAddress: accounts['seller-agent']!.address }],
  ]);
  const earnings = createSuiteEarnings({
    getDeal: async (id) => deals.get(id) ?? null,
    saveMove: async (id, key, move) => {
      const d = deals.get(id)!;
      d.suiteEarnings = { ...(d.suiteEarnings ?? {}), [key]: move };
    },
    listDeals: async () => [...deals.values()],
    transfer: async ({ walletId, to, amountMicros }) => ({ txHash: await sendAs(walletId, USDC, erc20Abi, 'transfer', [to, amountMicros]) }),
    transferProof: async (txHash, move) => {
      const receipt = await pub.getTransactionReceipt({ hash: txHash as Hex });
      if (receipt.status !== 'success') return 'reverted';
      const moved = receipt.logs.some((log) => {
        try {
          const ev = decodeEventLog({ abi: erc20Abi, data: log.data, topics: log.topics });
          return ev.eventName === 'Transfer' && ev.args.to.toLowerCase() === move.to.toLowerCase() && ev.args.value === move.amountMicros;
        } catch {
          return false;
        }
      });
      return moved ? 'landed' : 'unknown';
    },
    now: () => Date.now(),
    log: () => undefined,
  });
  const before = await balance(sellerUser);
  const swept = await earnings.onPayout(paid!);
  check('earnings moved to the seller identity wallet, exactly', !!swept && 'txHash' in swept && (await balance(sellerUser)) - before === sellerMicros);

  // 2. A checked deal: two of the three checkers pass it.
  const signers = createPlatformSigners(
    { checkerKeys: keyList, arbiterKey: process.env.FORK_ARBITER_KEY!, issuerKey: process.env.FORK_ISSUER_KEY! },
    {
      family: D.agreement!,
      readReportDigest: ({ family, dealId, revision, pass, evidenceHash }) =>
        pub.readContract({ address: D.verifier!, abi: verifierAbi, functionName: 'reportDigest', args: [family, dealId, revision, pass, evidenceHash] }),
      send: async (_from, fn, args, { account, to }) => {
        const targets: Record<PlatformTarget, { address: Hex; abi: readonly unknown[] }> = {
          verifier: { address: D.verifier!, abi: verifierAbi },
          escrow: { address: D.agreement!, abi: agreementEscrowAbi },
          record: { address: D.record!, abi: [] },
        };
        const hash = await createWalletClient({ account, chain, transport: http(RPC) }).writeContract({
          address: targets[to].address,
          abi: targets[to].abi as never,
          functionName: fn as never,
          args: args as never,
          account,
          chain,
        });
        const receipt = await pub.waitForTransactionReceipt({ hash });
        if (receipt.status !== 'success') throw new Error(`${to}.${fn} reverted (${hash})`);
        return hash;
      },
      readView,
      receiptReported: async (txHash, dealId, revision) =>
        (await pub.getTransactionReceipt({ hash: txHash })).logs.some((log) => {
          try {
            const ev = decodeEventLog({ abi: verifierAbi, data: log.data, topics: log.topics });
            return ev.eventName === 'Reported' && ev.args.dealId === dealId && ev.args.revision === revision;
          } catch {
            return false;
          }
        }),
      log: (line) => console.log(`      ${line}`),
    },
  );
  nowSecs = await chainNow();
  const checkedTerms = buildAgreementTerms(
    {
      kind: 'one_time',
      asset: USDC,
      seller: accounts['seller-agent']!.address,
      amountMicros: 50_000_000n,
      acceptBy: BigInt(nowSecs + 3 * DAY),
      deliveryDeadline: BigInt(nowSecs + 6 * DAY),
      reviewWindowSecs: limits.minReview,
      reclaimGraceSecs: DAY,
      agreementHash: `0x${'cd'.repeat(32)}`,
      checked: { verifier: D.verifier!, checkPolicy: CHECK_POLICY_V1 },
      nowSecs,
    },
    limits,
  );
  const checkedSalt = `0x${'02'.repeat(32)}` as Hex;
  await sendAs('buyer-agent', USDC, erc20Abi, 'approve', [D.agreement!, buyerPaysMicros(checkedTerms.amount, limits.feeBps)]);
  const { jobId: checkedId } = await escrow.fund({ walletId: 'buyer-agent', buyer: accounts['buyer-agent']!.address, salt: checkedSalt, terms: checkedTerms, dealKey: 'deal-checked' });
  await escrow.accept({ walletId: 'seller-agent', jobId: checkedId, termsHash: agreementTermsHash(checkedTerms), dealKey: 'deal-checked' });
  await escrow.markDelivered({ walletId: 'seller-agent', jobId: checkedId, proofHash: `0x${'df'.repeat(32)}`, dealKey: 'deal-checked' });
  const revision = (await readView(checkedId)).revision;
  await signers.submitCheck({ dealId: checkedId, revision, pass: true, evidenceHash: `0x${'ee'.repeat(32)}` });
  check('two checkers passed the checked deal', (await readView(checkedId)).checkPassed, `revision ${revision}`);

  // 3. A dispute on that delivery: the buyer disputes a checked, on-time
  // delivery, the table proposes paying the seller, it is carried out after the
  // 72-hour appeal window, and the seller's share moves home. (The escrow takes
  // a dispute only about a delivery; with none the buyer reclaims after the deadline.)
  await escrow.dispute({ walletId: 'buyer-agent', jobId: checkedId, clauseHash: `0x${'c1'.repeat(32)}`, dealKey: 'deal-checked' });
  check('the buyer disputed the delivery', (await readView(checkedId)).state === DEAL_STATE.Disputed);
  nowSecs = await chainNow();
  const deal = {
    jobId: 'deal-checked',
    buyer: buyerUser,
    seller: sellerUser,
    escrowVersion: 'suite',
    escrowDealId: checkedId,
    buyerAgentWalletId: 'buyer-agent',
    disputed: true,
    disputedBy: 'buyer',
    escrowTerms: storeAgreementTerms(checkedTerms),
  } as unknown as DirectDeal;
  const watcher: SuiteWatcherDeps = {
    escrow: { executeRuling: (a) => escrow.executeRuling(a), applyFallback: (a) => escrow.applyFallback(a) },
    arbiter: signers,
    readView: (d) => readView(d.escrowDealId as Hex),
    readEscalatedAt: (d) => reads.escalatedAt(D.agreement!, d.escrowDealId as Hex),
    readReceipt: async () => ({ agreementVersion: 1, state: 'not-recorded' }) as never,
    coolOffSecs: 0,
    patchDeal: async (_id, p) => {
      Object.assign(deal, p);
    },
    emit: () => undefined,
    alertOperator: async () => undefined,
    warn: () => undefined,
  };
  await runSuiteDispute(watcher, deal, nowSecs * 1000);
  const proposed = await readView(checkedId);
  check('the arbiter key proposed paying the seller, from the table', proposed.proposal && proposed.proposedBps === 10_000, deal.v3Ruling?.ruleId ?? '');
  await warp(72 * 3600 + 60);
  nowSecs = await chainNow();
  await runSuiteDispute(watcher, deal, nowSecs * 1000);
  const ended = await readView(checkedId);
  check('the ruling was carried out after the appeal window', ended.state !== DEAL_STATE.Disputed && deal.settledAt !== undefined, `state ${ended.state}`);
  const share = events.find((e) => e.type === 'escrow.seller.paid' && e.jobId === 'deal-checked');
  deals.set('deal-checked', { jobId: 'deal-checked', seller: sellerUser, escrowVersion: 'suite', sellerAgentWalletId: 'seller-agent', sellerAgentAddress: accounts['seller-agent']!.address });
  const beforeShare = await balance(sellerUser);
  const movedShare = share ? await earnings.onPayout(share) : null;
  check(
    "the seller's ruled share moved to their identity wallet, exactly",
    !!movedShare && 'txHash' in movedShare && (await balance(sellerUser)) - beforeShare === BigInt(String(share?.payload?.sellerMicros ?? -1)),
    String(share?.payload?.sellerMicros ?? 'no share event'),
  );
}

async function main(): Promise<void> {
  console.log(`suite fork e2e, ${phase}, block ${await pub.getBlockNumber()}`);
  await parity();
  if (phase === 'full') await full();
  console.log(failed === 0 ? 'all checks passed' : `${failed} check(s) failed`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(`FAIL  ${(err as Error).message}`);
  process.exit(1);
});
