'use client';
import { useCallback, useMemo, useState } from 'react';
import { useAccount, usePublicClient, useWalletClient } from 'wagmi';
import { api, ApiError } from '@/core/api';
import { arcChain } from '@/core/wagmi';
import { confirmTransaction } from '@/shared/chain/confirmTx';
import { useAuth } from '@/shared/hooks/useAuth';
import { useMoneyRefresh } from '@/shared/hooks/useMoneyRefresh';
import { useArcFund } from '@/features/profile/hooks/useArcFund';
import { useBridges } from '@/features/bridge/hooks/useBridge';
import { startedRecord } from '@/features/bridge/crossChainIntent';
import {
  afterRecheck,
  driverFor,
  fromArcFund,
  fromArcSend,
  fromFundingError,
  fromFundingResponse,
  fromMovementError,
  fromMovementResponse,
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
  /// Top-up only: where planTopUp said the money comes from.
  source?: 'balance' | 'pool';
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
              toAddress: auth.address,
              amountUsdc: request.amount,
              requestId,
            }),
          );
        } else if (request.source === 'pool') {
          next = fromMovementResponse(await api.gatewayFundAgent(request.agent, request.amount, requestId));
        } else {
          next = fromFundingResponse(
            await api.fundAgent({ address: auth.address, agent: request.agent, amountUsdc: request.amount, requestId }),
          );
        }
      } catch (err) {
        // An answer from the backend says what happened. No answer at all (the
        // connection dropped) cannot say, so it waits.
        if (!(err instanceof ApiError)) next = { kind: 'slow', reference: null, txHash: null };
        else if (request.move === 'topUp' && request.source !== 'pool') next = fromFundingError(err.status, err.code);
        else next = fromMovementError(err.status, err.message, err.body);
      } finally {
        refreshMoney();
      }
      setCallState((previous) => (recheck ? afterRecheck(previous, next) : next));
    },
    [auth.address, refreshMoney],
  );

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
        const input = { amountUsdc: request.amount, recipient: request.recipient, userAddress: auth.address };
        await (walletSigned ? startWeb3ArcSend(input) : startArcSend(input));
        refreshMoney();
        return;
      }
      const requestId = crypto.randomUUID();
      setActive({ driver: 'call', request, requestId });
      await call(request, requestId, false);
    },
    [auth.address, walletSigned, account.isConnected, walletClient, walletTopUp, startArcSend, startWeb3ArcSend, call, refreshMoney],
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
