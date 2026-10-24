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
]);

export class IdentityNeeded extends Error {
  constructor(readonly code: 'record_setup_needed' | 'agent_renewal_needed') {
    super(code === 'record_setup_needed' ? 'Set up your Karwan record first.' : 'Renew your buying agent first.');
  }
}

export interface AgentWalletRef {
  address: Hex;
  walletId: string;
}

export interface IdentityPorts {
  registry: Hex;
  chainId: number;
  now: () => number;
  binding: (wallet: Hex) => Promise<{ id: bigint; kind: number; expiry: bigint }>;
  nonce: (wallet: Hex) => Promise<bigint>;
  /// The person's identity wallet (walletId null when they hold it themselves) and agents.
  wallets: (userAddress: string) => Promise<{ identity: { address: Hex; walletId: string | null }; buyer: AgentWalletRef; seller: AgentWalletRef } | null>;
  signTypedData: (walletId: string, typedData: ReturnType<typeof bindingTypedData>) => Promise<Hex>;
  execute: (walletId: string, fn: 'register' | 'bind' | 'unbind', args: unknown[]) => Promise<{ txHash: string }>;
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
    const out: Array<{ args: unknown[] }> = [];
    const plan: Array<{ agent: AgentWalletRef; kind: number; expiry: bigint; perPayment: bigint; total: bigint }> = [];
    if (!status.buyerBound || status.buyerExpiresAt <= t) {
      plan.push({ agent: w.buyer, kind: KIND.Agent, expiry: t + BigInt(YEAR_SECS), perPayment: BUYING_AGENT_LIMITS.perPayment, total: BUYING_AGENT_LIMITS.total });
    }
    if (!status.sellerBound) plan.push({ agent: w.seller, kind: KIND.Wallet, expiry: 0n, perPayment: 0n, total: 0n });
    for (const p of plan) {
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
      out.push({ args: [p.agent.address, p.kind, p.expiry, p.perPayment, p.total, deadline, sig] });
    }
    return out;
  }

  /// Karwan signs from the identity wallet it holds: register, unbind an expired
  /// buying agent, bind both agents. Any step already on chain is skipped.
  async function setUpIdentityForCustodial(userAddress: string): Promise<void> {
    const w = await ports.wallets(userAddress);
    if (!w || !w.identity.walletId) throw new Error('this account signs its own record setup');
    const walletId = w.identity.walletId;
    let me = await ports.binding(w.identity.address);
    if (me.id === 0n) {
      await ports.execute(walletId, 'register', []);
      me = await ports.binding(w.identity.address);
      if (me.id === 0n) throw new Error('register did not land');
    }
    const buyer = await ports.binding(w.buyer.address);
    if (buyer.id === me.id && buyer.kind === KIND.Agent && buyer.expiry <= now()) {
      await ports.execute(walletId, 'unbind', [w.buyer.address]);
      if ((await ports.binding(w.buyer.address)).id !== 0n) throw new Error('unbind did not land');
    }
    for (const { args } of await missingBindings(w, me.id)) {
      const wallet = args[0] as Hex;
      await ports.execute(walletId, 'bind', args);
      if ((await ports.binding(wallet)).id !== me.id) throw new Error(`bind of ${wallet} did not land`);
    }
  }

  /// For a person who holds their own wallet: the calls still missing, to send
  /// from the browser. Register comes alone first, because the bindings name the
  /// identity it creates. An expired buying agent is unbound before it is bound.
  async function preparedSetupCalls(userAddress: string): Promise<Array<{ to: Hex; data: Hex }>> {
    const w = await ports.wallets(userAddress);
    if (!w) return [];
    const me = await ports.binding(w.identity.address);
    if (me.id === 0n) return [{ to: ports.registry, data: encodeFunctionData({ abi: registryAbi, functionName: 'register' }) }];
    const calls: Array<{ to: Hex; data: Hex }> = [];
    const buyer = await ports.binding(w.buyer.address);
    if (buyer.id === me.id && buyer.kind === KIND.Agent && buyer.expiry <= now()) {
      calls.push({ to: ports.registry, data: encodeFunctionData({ abi: registryAbi, functionName: 'unbind', args: [w.buyer.address] }) });
    }
    for (const { args } of await missingBindings(w, me.id)) {
      calls.push({ to: ports.registry, data: encodeFunctionData({ abi: registryAbi, functionName: 'bind', args: args as never }) });
    }
    return calls;
  }

  /// Before a money step on the family. A buyer needs a live buying agent; a seller
  /// needs the selling agent bound, so their deals count on their record.
  async function requireIdentity(userAddress: string, role: 'buyer' | 'seller'): Promise<void> {
    const s = await identityStatus(userAddress);
    if (s.identityId === 0n) throw new IdentityNeeded('record_setup_needed');
    if (role === 'seller' && !s.sellerBound) throw new IdentityNeeded('record_setup_needed');
    if (role === 'buyer') {
      if (!s.buyerBound && s.buyerExpiresAt === 0n) throw new IdentityNeeded('record_setup_needed');
      if (s.buyerExpiresAt <= now()) throw new IdentityNeeded('agent_renewal_needed');
    }
  }

  return { identityStatus, setUpIdentityForCustodial, preparedSetupCalls, requireIdentity };
}

export type SuiteIdentity = ReturnType<typeof createSuiteIdentity>;
