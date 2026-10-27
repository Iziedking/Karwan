import { encodeFunctionData, parseAbi } from 'viem';

/// One identity per person on the escrow family (view 27). The sign-in wallet
/// is the identity wallet: it registers, then binds the buying agent as an agent
/// with the beta limits and the selling agent as one of the person's wallets.
/// Each binding carries the agent wallet's own EIP-712 signature, which the
/// registry checks (ERC-1271 for a Circle smart account; Task 1 proved it on Arc).
/// Every step is proven by a fresh read of the registry.

type Hex = `0x${string}`;

const YEAR_SECS = 365 * 86_400;
const DEADLINE_SECS = 3_600;
/// A step's result is read back until the read node shows it: right after a
/// call it can still answer with the state before (26 Oct 2026, 12 of 38
/// backfilled accounts stopped on a step that had in fact landed).
const CONFIRM_TRIES = 10;
const CONFIRM_PAUSE_MS = 2_000;

/// KarwanIdentityRegistry.Kind.
export const KIND = { None: 0, Wallet: 1, Agent: 2 } as const;

/// Spec decision 2: the same for every account, because every account's buying agent pays.
export const BUYING_AGENT_LIMITS = { perPayment: 1_005_000_000n, total: 10_000_000_000n, days: 365 } as const;

export const registryAbi = parseAbi([
  'function register() returns (uint64)',
  'function bind(address wallet, uint8 kind, uint64 expiry, uint128 perPayment, uint128 total, uint256 deadline, bytes walletSig)',
  'function unbind(address wallet)',
  'function bindingOf(address wallet) view returns (uint64 id, uint8 kind, uint64 expiry)',
  'function nonces(address wallet) view returns (uint256)',
  'function identityOf(address wallet) view returns (uint64)',
  'function isAgent(address wallet) view returns (bool)',
  'function identityCount() view returns (uint64)',
  'function agentLimitOf(address wallet) view returns (uint128 perPayment, uint128 total, uint128 used)',
]);

export type RecordStepName = 'register' | 'unbindExpired' | 'bindBuyer' | 'bindSeller';
export type RecordStep = { name: RecordStepName; to: Hex; data: Hex };
/// Every call still missing from a person's record, for their own wallet to send
/// in one transaction. When there is no identity yet, the bindings are signed for
/// the number the registration will create (`identityIdAfter`).
export type RecordSteps = { complete: boolean; steps: RecordStep[]; identityIdAfter: bigint; validUntil: bigint };

export interface AgentWalletRef {
  address: Hex;
  walletId: string;
}

export interface PersonWallets {
  identity: { address: Hex; walletId: string | null };
  buyer: AgentWalletRef;
  seller: AgentWalletRef;
}

export interface IdentityPorts {
  registry: Hex;
  chainId: number;
  now: () => number;
  binding: (wallet: Hex) => Promise<{ id: bigint; kind: number; expiry: bigint }>;
  nonce: (wallet: Hex) => Promise<bigint>;
  /// The person's identity wallet (walletId null when they hold it themselves) and agents.
  wallets: (userAddress: string) => Promise<PersonWallets | null>;
  /// The same, making the person's agents first when they have none. Only the
  /// setup paths call it, so reading a status never creates wallets.
  ensureWallets: (userAddress: string) => Promise<PersonWallets | null>;
  /// Whether a smart account is on chain yet. Circle deploys one at its first
  /// transaction and cannot sign for it before then.
  isDeployed: (address: Hex) => Promise<boolean>;
  /// One harmless call from the agent, which puts its account on chain.
  deployAgent: (walletId: string, address: Hex) => Promise<void>;
  signTypedData: (walletId: string, typedData: ReturnType<typeof bindingTypedData>) => Promise<Hex>;
  execute: (walletId: string, fn: 'register' | 'bind' | 'unbind', args: unknown[]) => Promise<{ txHash: string }>;
  /// How many identities the registry has made; the next one gets this plus one.
  identityCount: () => Promise<bigint>;
  agentLimit: (wallet: Hex) => Promise<{ perPayment: bigint; total: bigint; used: bigint }>;
  /// Testnet (owner, 26 Oct 2026): where Karwan holds the person's wallets it
  /// signs their record setup itself when a record is needed, instead of asking.
  autoSetupCustodial?: boolean;
  warn?: (fields: Record<string, unknown>, msg: string) => void;
  pause?: (ms: number) => Promise<void>;
}

export function bindingTypedData(args: {
  registry: Hex;
  chainId: number;
  identityId: bigint;
  wallet: Hex;
  kind: number;
  expiry: bigint;
  perPayment: bigint;
  total: bigint;
  deadline: bigint;
  nonce: bigint;
}) {
  return {
    domain: { name: 'KarwanIdentity', version: '1', chainId: args.chainId, verifyingContract: args.registry },
    types: {
      Bind: [
        { name: 'id', type: 'uint64' },
        { name: 'wallet', type: 'address' },
        { name: 'kind', type: 'uint8' },
        { name: 'expiry', type: 'uint64' },
        { name: 'perPayment', type: 'uint128' },
        { name: 'total', type: 'uint128' },
        { name: 'nonce', type: 'uint256' },
        { name: 'deadline', type: 'uint256' },
      ],
    },
    primaryType: 'Bind' as const,
    message: {
      id: args.identityId,
      wallet: args.wallet,
      kind: args.kind,
      expiry: args.expiry,
      perPayment: args.perPayment,
      total: args.total,
      nonce: args.nonce,
      deadline: args.deadline,
    },
  };
}

export function createSuiteIdentity(ports: IdentityPorts) {
  const now = () => BigInt(ports.now());
  const pause = ports.pause ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));

  async function confirmed(wallet: Hex, ok: (b: { id: bigint; kind: number; expiry: bigint }) => boolean) {
    for (let i = 0; i < CONFIRM_TRIES; i += 1) {
      const b = await ports.binding(wallet);
      if (ok(b)) return b;
      await pause(CONFIRM_PAUSE_MS);
    }
    return null;
  }

  async function identityStatus(userAddress: string) {
    const w = await ports.wallets(userAddress);
    if (!w) return { identityId: 0n, buyerBound: false, buyerExpiresAt: 0n, sellerBound: false };
    const [me, buyer, seller] = await Promise.all([ports.binding(w.identity.address), ports.binding(w.buyer.address), ports.binding(w.seller.address)]);
    const id = me.id;
    return {
      identityId: id,
      buyerBound: id !== 0n && buyer.id === id && buyer.kind === KIND.Agent,
      buyerExpiresAt: buyer.id === id && id !== 0n ? buyer.expiry : 0n,
      sellerBound: id !== 0n && seller.id === id && seller.kind === KIND.Wallet,
    };
  }

  /// The two bindings still missing, each with its agent's signature.
  async function missingBindings(w: NonNullable<Awaited<ReturnType<IdentityPorts['wallets']>>>, identityId: bigint) {
    const status = await identityStatus(w.identity.address);
    const t = now();
    const deadline = t + BigInt(DEADLINE_SECS);
    const out: Array<{ role: 'buying' | 'selling'; args: unknown[] }> = [];
    const plan: Array<{ agent: AgentWalletRef; role: string; kind: number; expiry: bigint; perPayment: bigint; total: bigint }> = [];
    if (!status.buyerBound || status.buyerExpiresAt <= t) {
      plan.push({ agent: w.buyer, role: 'buying', kind: KIND.Agent, expiry: t + BigInt(YEAR_SECS), perPayment: BUYING_AGENT_LIMITS.perPayment, total: BUYING_AGENT_LIMITS.total });
    }
    if (!status.sellerBound) plan.push({ agent: w.seller, role: 'selling', kind: KIND.Wallet, expiry: 0n, perPayment: 0n, total: 0n });
    for (const p of plan) {
      if (!(await ports.isDeployed(p.agent.address))) {
        await ports.deployAgent(p.agent.walletId, p.agent.address);
        if (!(await ports.isDeployed(p.agent.address))) throw new Error(`your ${p.role} agent could not be set up on chain yet; try again in a moment`);
      }
      const typed = bindingTypedData({
        registry: ports.registry,
        chainId: ports.chainId,
        identityId,
        wallet: p.agent.address,
        kind: p.kind,
        expiry: p.expiry,
        perPayment: p.perPayment,
        total: p.total,
        deadline,
        nonce: await ports.nonce(p.agent.address),
      });
      const sig = await ports.signTypedData(p.agent.walletId, typed);
      out.push({ role: p.role as 'buying' | 'selling', args: [p.agent.address, p.kind, p.expiry, p.perPayment, p.total, deadline, sig] });
    }
    return { bindings: out, deadline };
  }

  /// Karwan signs from the identity wallet it holds: register, unbind an expired
  /// buying agent, bind both agents. Any step already on chain is skipped.
  async function setUpIdentityForCustodial(userAddress: string): Promise<void> {
    const w = await ports.ensureWallets(userAddress);
    if (!w || !w.identity.walletId) throw new Error('this account signs its own record setup');
    const walletId = w.identity.walletId;
    let me = await ports.binding(w.identity.address);
    if (me.id === 0n) {
      await ports.execute(walletId, 'register', []);
      const landed = await confirmed(w.identity.address, (b) => b.id !== 0n);
      if (!landed) throw new Error('register did not land');
      me = landed;
    }
    const buyer = await ports.binding(w.buyer.address);
    if (buyer.id === me.id && buyer.kind === KIND.Agent && buyer.expiry <= now()) {
      await ports.execute(walletId, 'unbind', [w.buyer.address]);
      if (!(await confirmed(w.buyer.address, (b) => b.id === 0n))) throw new Error('unbind did not land');
    }
    for (const { args } of (await missingBindings(w, me.id)).bindings) {
      const wallet = args[0] as Hex;
      await ports.execute(walletId, 'bind', args);
      const id = me.id;
      if (!(await confirmed(wallet, (b) => b.id === id))) throw new Error(`bind of ${wallet} did not land`);
    }
  }

  /// For a person who holds their own wallet: every call still missing, in the
  /// order the registry needs, to send in one transaction. An expired buying
  /// agent is unbound before it is bound again.
  async function recordSteps(userAddress: string): Promise<RecordSteps> {
    const w = await ports.ensureWallets(userAddress);
    if (!w) return { complete: false, steps: [], identityIdAfter: 0n, validUntil: 0n };
    const step = (name: RecordStepName, data: Hex): RecordStep => ({ name, to: ports.registry, data });
    const steps: RecordStep[] = [];
    let identityId = (await ports.binding(w.identity.address)).id;
    if (identityId === 0n) {
      identityId = (await ports.identityCount()) + 1n;
      steps.push(step('register', encodeFunctionData({ abi: registryAbi, functionName: 'register' })));
    } else {
      const buyer = await ports.binding(w.buyer.address);
      if (buyer.id === identityId && buyer.kind === KIND.Agent && buyer.expiry <= now()) {
        steps.push(step('unbindExpired', encodeFunctionData({ abi: registryAbi, functionName: 'unbind', args: [w.buyer.address] })));
      }
    }
    const { bindings, deadline } = await missingBindings(w, identityId);
    for (const { role, args } of bindings) {
      steps.push(step(role === 'buying' ? 'bindBuyer' : 'bindSeller', encodeFunctionData({ abi: registryAbi, functionName: 'bind', args: args as never })));
    }
    return { complete: steps.length === 0, steps, identityIdAfter: identityId, validUntil: deadline };
  }

  /// Whether the record is ready for this side of a deal: a live buying agent for
  /// a buyer, the selling agent attached for a seller.
  async function recordReady(userAddress: string, role: 'buyer' | 'seller'): Promise<boolean> {
    const s = await identityStatus(userAddress);
    if (s.identityId === 0n) return false;
    return role === 'seller' ? s.sellerBound : s.buyerBound && s.buyerExpiresAt > now();
  }

  /// Nothing waits for a record (view 27, decision 10). Where Karwan holds the
  /// wallets it sets the record up on the spot; a person with their own wallet
  /// gets theirs with their next transaction, so for them this only reports.
  async function ensureRecord(userAddress: string, role: 'buyer' | 'seller'): Promise<'ready' | 'not-ready'> {
    if (await recordReady(userAddress, role)) return 'ready';
    if (!ports.autoSetupCustodial) return 'not-ready';
    const w = await ports.wallets(userAddress);
    if (w && !w.identity.walletId) return 'not-ready';
    try {
      await setUpOnce(userAddress);
    } catch (err) {
      ports.warn?.({ userAddress, err: (err as Error).message }, 'automatic record setup failed');
      return 'not-ready';
    }
    return (await recordReady(userAddress, role)) ? 'ready' : 'not-ready';
  }

  /// A buying agent past its year, or over its limits for this payment, makes the
  /// registry refuse the payment. The agent leaves the record on its own (the
  /// registry lets a wallet unbind itself), so the payment goes on; it is attached
  /// again with the record's next setup. True when it left.
  async function freeBuyingAgent(userAddress: string, amountMicros: bigint): Promise<boolean> {
    const w = await ports.wallets(userAddress);
    if (!w) return false;
    const buyer = await ports.binding(w.buyer.address);
    if (buyer.id === 0n || buyer.kind !== KIND.Agent) return false;
    const limit = await ports.agentLimit(w.buyer.address);
    const blocked = buyer.expiry <= now() || amountMicros > limit.perPayment || limit.used + amountMicros > limit.total;
    if (!blocked) return false;
    await ports.execute(w.buyer.walletId, 'unbind', [w.buyer.address]);
    if (!(await confirmed(w.buyer.address, (b) => b.id === 0n))) throw new Error('the buying agent could not step aside');
    return true;
  }

  /// One setup per person at a time: a selling agent can reach several
  /// requests together, and each would otherwise send its own register.
  const settingUp = new Map<string, Promise<void>>();
  function setUpOnce(userAddress: string): Promise<void> {
    const key = userAddress.toLowerCase();
    const pending = settingUp.get(key);
    if (pending) return pending;
    const run = setUpIdentityForCustodial(userAddress).finally(() => settingUp.delete(key));
    settingUp.set(key, run);
    return run;
  }

  return { identityStatus, setUpIdentityForCustodial, recordSteps, ensureRecord, freeBuyingAgent };
}

export type SuiteIdentity = ReturnType<typeof createSuiteIdentity>;
