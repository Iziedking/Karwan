'use client';
import { useCallback, useEffect, useState } from 'react';
import { useWalletClient, useChainId, usePublicClient, useSwitchChain } from 'wagmi';
import { api, ApiError, type AgentBinding } from '@/core/api';
import { useAuth } from '@/shared/hooks/useAuth';
import { useTranslations } from '@/shared/i18n/LocaleProvider';
import { chainErrorMessage } from '@/shared/utils/chainError';
import { requireConfirmedTx } from '@/shared/chain/confirmTx';
import { ARC_CHAIN_ID, KARWAN_VAULT_ADDRESS } from '../../profile/config';

/// Letting your agents draw on your stake.
///
/// Agent wallets hold no funds; everything you own sits on the identity wallet.
/// The vault implements that, resolving an agent to its identity before reading
/// a balance, which is how a seller agent can sign for a deal that your stake
/// backs. The resolution only exists once the pair is bound, and binding is a
/// consented handshake: the identity approves the agent, then the agent
/// registers the identity. Only the first half is yours to sign, because the
/// vault reads the sender as the owner giving consent, and consent Karwan could
/// send on your behalf would not be consent.
///
/// It lives here rather than in onboarding because this is where stake starts
/// mattering: signing to stake and signing to let your agent use it are one
/// thought. Until it is done, a deal that reserves stake cannot activate, and
/// the seller is told only that activation failed.
const approveAgentAbi = [
  {
    type: 'function',
    name: 'approveAgent',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'agent', type: 'address' }],
    outputs: [],
  },
] as const;

export function AgentStakeBinding() {
  const auth = useAuth();
  const address = auth.address as `0x${string}` | undefined;
  const isCircleUser = auth.method === 'circle';
  const { data: walletClient } = useWalletClient();
  const arcClient = usePublicClient({ chainId: ARC_CHAIN_ID });
  const chainId = useChainId();
  const { switchChainAsync } = useSwitchChain();
  const t = useTranslations().agentStakeBinding;
  const chainCopy = useTranslations().chainErrors;

  const [agents, setAgents] = useState<AgentBinding[] | null>(null);
  // Whichever vault the backend will register against. See AgentBindingStatus.
  const [vaultAddress, setVaultAddress] = useState<`0x${string}` | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const load = useCallback(() => {
    if (!address) return;
    api
      .agentBinding(address)
      .then((res) => {
        setAgents(res.agents);
        setVaultAddress(res.vault ?? null);
      })
      .catch(() => setAgents(null));
  }, [address]);

  useEffect(() => load(), [load]);

  const unbound = (agents ?? []).filter((a) => a.kind === 'unbound');
  const foreign = (agents ?? []).filter((a) => a.kind === 'foreign');

  async function bind() {
    if (!address) return;
    setError(null);
    setBusy(true);
    try {
      // An email or passkey account's identity is a wallet Karwan signs with,
      // so there is nothing to sign here: the whole handshake runs server-side.
      if (!isCircleUser) {
        if (!walletClient) throw new Error(chainCopy.generic);
        if (chainId !== ARC_CHAIN_ID) await switchChainAsync({ chainId: ARC_CHAIN_ID });
        for (const agent of unbound) {
          const hash = await walletClient.writeContract({
            // The backend's vault, not the one this bundle was built against.
            address: vaultAddress ?? KARWAN_VAULT_ADDRESS,
            abi: approveAgentAbi,
            functionName: 'approveAgent',
            args: [agent.agent as `0x${string}`],
            chain: walletClient.chain,
            account: address,
          });
          // The registration below READS this approval, so it has to be on
          // chain before that call, not merely submitted. Confirming here is
          // what stops registerOwner reverting AgentNotApproved on a race.
          if (!arcClient) throw new Error(chainCopy.generic);
          await requireConfirmedTx(arcClient, hash, chainCopy.reverted);
        }
      }
      const res = await api.registerAgentBinding(address);
      if (!res.bound) throw new Error(t.incomplete);
      setDone(true);
      load();
    } catch (err) {
      const detail = err instanceof ApiError ? err.message : undefined;
      setError(
        detail?.trim() ? detail : chainErrorMessage(err, chainCopy, t.failed),
      );
    } finally {
      setBusy(false);
    }
  }

  // Nothing to say while it loads, and nothing to say once every agent resolves.
  if (!address || agents === null) return null;
  if (unbound.length === 0 && foreign.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-3">
      {foreign.length === 0 && (
        <button
          type="button"
          onClick={() => void bind()}
          disabled={busy || done}
          aria-busy={busy}
          className="inline-flex min-h-11 items-center rounded-[10px] border border-[var(--lp-border-light)] px-4 py-2.5 text-[14px] font-semibold text-[var(--lp-dark)] transition-colors hover:bg-[var(--lp-light)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-accent)] focus-visible:ring-offset-2 disabled:opacity-50"
        >
          {done ? t.doneCta : busy ? t.busyCta : t.cta}
        </button>
      )}
      {foreign.length > 0 && (
        <p role="status" className="text-[13px] leading-snug text-[var(--color-critical)]">
          {t.foreignBody}
        </p>
      )}
      {error && (
        <p role="alert" className="text-[13px] leading-snug text-[var(--color-critical)]">{error}</p>
      )}
    </div>
  );
}
