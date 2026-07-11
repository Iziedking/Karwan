import { GATEWAY_CHAINS } from '@/features/bridge/config';
import { SPEND_STEPS, type GatewayStep } from './GatewayProgress';

const SPEND_STEP_NAMES: readonly string[] = SPEND_STEPS;

/// Circle Gateway, shared across the four surfaces that touch it: the /bridge
/// rail, the profile wallets panel, the deal page, and the post-a-job form.
///
/// The one fact the whole feature rests on: Gateway rejects SCA (EIP-1271)
/// signatures on burn intents, so only an EOA can SIGN a spend. But minting TO
/// an SCA is an ordinary ERC-20 mint, so a Circle agent wallet can RECEIVE one.
/// That is what makes "top up my agent from Gateway" work: the user's own EOA
/// signs, the agent SCA receives.

export const ARC_APPKIT_CHAIN = 'Arc_Testnet';

/// Build App Kit against the user's connected browser wallet. Dynamic-imported
/// so the SDK is not in the initial bundle of every page that merely shows a
/// top-up button.
export async function loadGatewayKit(provider: unknown) {
  const { AppKit } = await import('@circle-fin/app-kit');
  const { createViemAdapterFromProvider } = await import('@circle-fin/adapter-viem-v2');
  const adapter: unknown = await createViemAdapterFromProvider({
    provider: provider as never,
  });
  return { kit: new AppKit(), adapter };
}

/// App Kit reports allocations by its own chain name ('Base_Sepolia'). Map back
/// to what we show users, falling back to the raw name rather than dropping a
/// chain we do not recognise.
export function gatewayChainLabel(appKitChain: string): string {
  return GATEWAY_CHAINS.find((c) => c.appKit === appKitChain)?.name ?? appKitChain;
}

/// Spend pooled USDC onto a destination chain.
///
/// `from` deliberately carries no allocations: Gateway then picks the source
/// chains itself and can draw across several in a single signature. The burn
/// intent set is chain-agnostic (its EIP-712 domain has no chainId), so this
/// needs no chain switch and no source-chain gas. `useForwarder` hands the
/// destination mint to Circle's relayer, so the recipient needs no gas either.
export async function gatewaySpend(input: {
  provider: unknown;
  amount: string;
  recipientAddress: string;
  chain?: string;
  /// Called as each stage lands. The SDK reports buildBurnIntents ->
  /// signBurnIntents -> fetchAttestation -> mint, and the mint happens AFTER the
  /// user's signature via Circle's forwarder, so without this the last and
  /// longest stage is invisible.
  onStep?: (name: string, step: GatewayStep) => void;
}): Promise<{
  allocations: Array<{ chain: string; amount: string }>;
  txHash?: string;
  explorerUrl?: string;
}> {
  const { kit, adapter } = await loadGatewayKit(input.provider);

  if (input.onStep) {
    // One listener per stage. The kit is per-call, so these can never bleed
    // across two concurrent spends.
    const ub = kit.unifiedBalance as unknown as {
      on: (event: string, handler: (payload: unknown) => void) => void;
    };
    for (const name of SPEND_STEP_NAMES) {
      ub.on(`gateway.spend.step.${name}`, (payload: unknown) => {
        const data = (payload as { data?: GatewayStep }).data;
        if (data) input.onStep?.(name, data);
      });
    }
  }

  const res = (await kit.unifiedBalance.spend({
    from: { adapter },
    to: {
      chain: input.chain ?? ARC_APPKIT_CHAIN,
      recipientAddress: input.recipientAddress,
      useForwarder: true,
    },
    amount: input.amount,
    token: 'USDC',
  } as never)) as {
    allocations?: Array<{ chain: string; amount: string }>;
    txHash?: string;
    explorerUrl?: string;
  };
  return {
    allocations: res?.allocations ?? [],
    txHash: res?.txHash,
    explorerUrl: res?.explorerUrl,
  };
}

/// Deposit into the pool, reporting the tx once it lands.
///
/// Deposit has no step events (it is a plain approve + deposit), but its result
/// carries txHash + explorerUrl, which we used to throw away.
export async function gatewayDeposit(input: {
  provider: unknown;
  amount: string;
  chain: string;
}): Promise<{ txHash?: string; explorerUrl?: string }> {
  const { kit, adapter } = await loadGatewayKit(input.provider);
  // allowanceStrategy defaults to 'authorize' (EIP-2612 permit): one signature,
  // no separate approve tx. That only works because the signer is an EOA.
  const res = (await kit.unifiedBalance.deposit({
    from: { adapter, chain: input.chain },
    amount: input.amount,
    token: 'USDC',
  } as never)) as { txHash?: string; explorerUrl?: string };
  return { txHash: res?.txHash, explorerUrl: res?.explorerUrl };
}

/// Open the Gateway rail in a new tab so the user can pool USDC from any chain.
/// Used when their pooled balance is too small to cover a top-up: rather than
/// showing a button that can only fail, send them where the money comes from and
/// leave the page they were on intact.
export function openGatewayRail(): void {
  window.open('/bridge?rail=gateway', '_blank', 'noopener');
}
