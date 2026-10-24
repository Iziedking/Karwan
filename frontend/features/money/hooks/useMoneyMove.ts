'use client';
import { useCallback, useMemo, useState } from 'react';
import { useAccount, usePublicClient, useWalletClient } from 'wagmi';
import { api, ApiError, ConfirmCancelled } from '@/core/api';
import { arcChain } from '@/core/wagmi';
import { confirmTransaction } from '@/shared/chain/confirmTx';
import { useAuth } from '@/shared/hooks/useAuth';
import { useMoneyRefresh } from '@/shared/hooks/useMoneyRefresh';
import { useArcFund } from '@/features/profile/hooks/useArcFund';
import { useBridges } from '@/features/bridge/hooks/useBridge';
import { startedRecord } from '@/features/bridge/crossChainIntent';
import { moneyOutRefusalOf } from '@/features/moneyOut/refusal';
import { formatUnits } from 'viem';
import { sendShortfall, topUpWithFees } from '../sendFromWhole';
import { gatewayEstimateSpend, gatewaySpend } from '@/features/gateway/lib';
import {
  afterRecheck,
  driverFor,
  fromArcFund,
  fromArcSend,
  fromFundingError,
  fromFundingResponse,
  fromMovementError,
  fromMovementResponse,
  fromWalletPoolSpend,
  type AgentKey,
  type MoneyMove,
  type SheetState,
} from '../moneySheetModel';

export interface MoveRequest {
  move: MoneyMove;
  agent: AgentKey;
  /// Top-up only: the agent wallet that receives the money.
  agentAddress?: `0x${string}`;
  amount: number;
  /// Send only: the checked Arc recipient.
  recipient?: `0x${string}`;
  /// Withdraw only: where the agent's USDC goes. Defaults to the account itself.
  toAddress?: `0x${string}`;
  /// Top-up only: where planTopUp said the money comes from.
  source?: 'balance' | 'pool';
  /// Send only: the wallet's USDC on Arc when the send was pressed. A send
  /// larger than it draws the rest from the pooled balance first (view 22).
  walletBalance?: number | null;
}

type Active =
  | { driver: 'walletTopUp'; since: number; agent: AgentKey }
  | { driver: 'send'; since: number }
  | { driver: 'call'; request: MoveRequest; requestId: string };

/// One state for every quick move, over the drivers that already move money.
/// Nothing here picks a route or re-sends: "Check again" asks about the movement
/// already in flight, with the same request id or the same hash, so the answer
/// is about that movement and nothing is paid twice. An unclear failure waits;
/// only a refusal or a revert says nothing moved.
export function useMoneyMove() {
  const auth = useAuth();
  const walletSigned = auth.method === 'web3';
  const account = useAccount();
  const { data: walletClient } = useWalletClient();
  const walletTopUp = useArcFund();
  const { bridges, startArcSend, startWeb3ArcSend } = useBridges();
  const arcClient = usePublicClient({ chainId: arcChain.id });
  const refreshMoney = useMoneyRefresh();
  const [active, setActive] = useState<Active | null>(null);
  const [callState, setCallState] = useState<SheetState>({ kind: 'editing' });
  const [sendChecked, setSendChecked] = useState<SheetState | null>(null);

  const state: SheetState = useMemo(() => {
    if (!active) return callState.kind === 'editing' ? { kind: 'editing' } : callState;
    switch (active.driver) {
      case 'walletTopUp':
        return fromArcFund(walletTopUp.records.find((r) => r.startedAt >= active.since && r.agentKey === active.agent) ?? null);
      case 'send':
        return (
          sendChecked ??
          fromArcSend(startedRecord(bridges, active.since, { direction: 'out', chainKey: 'arc' }), walletSigned ? 'wallet' : 'account')
        );
      case 'call':
        return callState;
    }
  }, [active, walletTopUp.records, bridges, sendChecked, walletSigned, callState]);

  const call = useCallback(
    async (request: MoveRequest, requestId: string, recheck: boolean) => {
      if (!auth.address) return;
      if (!recheck) setCallState({ kind: 'sent' });
      let next: SheetState;
      try {
        if (request.move === 'withdraw') {
          next = fromMovementResponse(
            await api.withdrawFromAgent({
              address: auth.address,
              agent: request.agent,
              toAddress: request.toAddress ?? auth.address,
              amountUsdc: request.amount,
              requestId,
            }),
          );
        } else {
          next = fromFundingResponse(
            await api.fundAgent({ address: auth.address, agent: request.agent, amountUsdc: request.amount, requestId }),
          );
        }
      } catch (err) {
        // An answer from the backend says what happened. No answer at all (the
        // connection dropped) cannot say, so it waits.
        const refusal = moneyOutRefusalOf(err);
        // Closing the confirmation sends nothing: back to the form.
        if (err instanceof ConfirmCancelled) next = { kind: 'editing' };
        else if (refusal) next = { kind: 'guarded', refusal };
        else if (!(err instanceof ApiError)) next = { kind: 'slow', reference: null, txHash: null };
        else if (request.move === 'topUp') next = fromFundingError(err.status, err.code);
        else next = fromMovementError(err.status, err.message, err.body);
      } finally {
        refreshMoney();
      }
      setCallState((previous) => (recheck ? afterRecheck(previous, next) : next));
    },
    [auth.address, refreshMoney],
  );

  /// Waits until the wallet holds `amount` on Arc, so the send that follows a
  /// top-up from the pool never goes out short. Gives up after 45 seconds.
  const walletReaches = useCallback(async (amount: number) => {
    if (!arcClient || !auth.address) throw new Error('no Arc client');
    const deadline = Date.now() + 45_000;
    while (Date.now() < deadline) {
      const raw = await arcClient.getBalance({ address: auth.address as `0x${string}` }).catch(() => null);
      if (raw !== null && Number(formatUnits(raw, arcChain.nativeCurrency.decimals)) >= amount) return;
      await new Promise((resolve) => setTimeout(resolve, 1500));
    }
    throw new Error('the wallet did not show the top-up in time');
  }, [arcClient, auth.address]);

  const start = useCallback(
    async (request: MoveRequest) => {
      if (!auth.address) return;
      const driver = driverFor(request, walletSigned);
      if (!driver) return;
      // A wallet that is not connected, or not ready yet, would never be asked
      // to sign; the sheet would wait on a signature that cannot come.
      if (walletSigned && (driver === 'walletTopUp' || driver === 'send') && (!account.isConnected || !walletClient)) {
        setActive(null);
        setCallState({ kind: 'failed', declined: false });
        return;
      }
      const since = Date.now();
      setSendChecked(null);
      if (driver === 'walletTopUp' && request.agentAddress) {
        setActive({ driver: 'walletTopUp', since, agent: request.agent });
        await walletTopUp.start({ agentKey: request.agent, agentAddress: request.agentAddress, amountUsdc: request.amount });
        refreshMoney();
        return;
      }
      if (driver === 'send' && request.recipient) {
        setActive({ driver: 'send', since });
        // One send to the person: the top-up from the pool, when needed, has
        // no step of its own on screen.
        const shortfall = sendShortfall(request.amount, request.walletBalance ?? null);
        if (shortfall > 0) {
          try {
            // Only a wallet account has a pool, and only its own signature can
            // spend it: the wallet tops itself up.
            if (!walletSigned || !account.connector) throw new Error('no wallet to sign the top-up');
            const provider = await account.connector.getProvider();
            const self = auth.address;
            const fees = await gatewayEstimateSpend({ provider, amount: String(shortfall), recipientAddress: self });
            await gatewaySpend({ provider, amount: String(topUpWithFees(shortfall, fees)), recipientAddress: self });
            await walletReaches(request.amount);
          } catch {
            setActive(null);
            setCallState({ kind: 'failed', declined: false });
            refreshMoney();
            return;
          }
        }
        const input = { amountUsdc: request.amount, recipient: request.recipient, userAddress: auth.address };
        await (walletSigned ? startWeb3ArcSend(input) : startArcSend(input));
        refreshMoney();
        return;
      }
      const requestId = crypto.randomUUID();
      setActive({ driver: 'call', request, requestId });
      if (request.source === 'pool') {
        // The pool belongs to the connected wallet; only its signature spends it.
        // The forwarder's fee goes on top so the agent receives the whole amount.
        setCallState({ kind: 'sent' });
        try {
          if (!walletSigned || !account.connector || !request.agentAddress) throw new Error('no wallet to sign the top-up');
          const provider = await account.connector.getProvider();
          const fees = await gatewayEstimateSpend({ provider, amount: String(request.amount), recipientAddress: request.agentAddress });
          const spent = await gatewaySpend({ provider, amount: String(topUpWithFees(request.amount, fees)), recipientAddress: request.agentAddress });
          setCallState(fromWalletPoolSpend({ txHash: spent.txHash }));
        } catch (error) {
          setCallState(fromWalletPoolSpend({ error }));
        }
        refreshMoney();
        return;
      }
      await call(request, requestId, false);
    },
    [auth.address, walletSigned, account.isConnected, account.connector, walletClient, walletTopUp, startArcSend, startWeb3ArcSend, call, refreshMoney, walletReaches],
  );

  const checkAgain = useCallback(async () => {
    if (!active) return;
    if (active.driver === 'walletTopUp') {
      const record = walletTopUp.records.find((r) => r.startedAt >= active.since && r.agentKey === active.agent);
      // The record holds its hash, so a retry reconciles the receipt; it never re-sends.
      if (record?.txHash) await walletTopUp.retry(record.id);
      return;
    }
    if (active.driver === 'call') {
      // A wallet-signed pool spend has no backend record to ask, and asking the
      // wallet again would sign a second spend: only the balances refresh.
      if (active.request.source === 'pool') {
        refreshMoney();
        return;
      }
      // Same request id: the backend answers for the movement it already has.
      await call(active.request, active.requestId, true);
      return;
    }
    const record = startedRecord(bridges, active.since, { direction: 'out', chainKey: 'arc' });
    const hash = (record?.mintTxHash ?? record?.burnTxHash) as `0x${string}` | undefined;
    if (!hash || !arcClient) return;
    const outcome = await confirmTransaction(arcClient, hash).catch(() => ({ state: 'pending' as const }));
    if (outcome.state === 'success') setSendChecked({ kind: 'confirmed', reference: null, txHash: hash });
    else if (outcome.state === 'reverted') setSendChecked({ kind: 'reverted' });
    refreshMoney();
  }, [active, walletTopUp, call, bridges, arcClient, refreshMoney]);

  const reset = useCallback(() => {
    setActive(null);
    setCallState({ kind: 'editing' });
    setSendChecked(null);
  }, []);

  return { state, start, checkAgain, reset };
}
