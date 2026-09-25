'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { api, ApiError } from '@/core/api';
import { useAuth } from '@/shared/hooks/useAuth';
import { useActivation } from '@/shared/hooks/useActivation';
import { useMoneyMove } from '@/features/money/hooks/useMoneyMove';
import { initRun, nextStep, postOutcome, runBusy, runClosable, runFinished, setStep, type RunState, type StepStatus } from '../startRun';
import type { StartStep } from '../startPlan';

export type PostInput =
  | {
      kind: 'request';
      brief: string;
      budgetUsdc: number;
      deadlineDays: number;
      negotiationMaxIncreasePct?: number;
      trustedMatch?: boolean;
      milestonePcts?: number[];
    }
  | {
      kind: 'offer';
      title: string;
      description: string;
      askingPriceUsdc: number;
      negotiationMaxDecreasePct?: number;
      ttlDays: number;
    };

type Move = { amount: number; source: 'balance' | 'pool' } | null;

/// A refusal is an answer; anything else (5xx, no answer) cannot say whether
/// it happened, so the step waits for "Check again".
const refused = (err: unknown) => err instanceof ApiError && err.status >= 400 && err.status < 500;

/// Runs the start sheet's steps in order: set up the agents, move the money,
/// post. Posting is not idempotent, so an unclear post is resolved by looking
/// for what it created, never by posting again.
export function useStartRun() {
  const auth = useAuth();
  const activation = useActivation();
  const money = useMoneyMove();
  const [run, setRun] = useState<RunState | null>(null);
  const input = useRef<PostInput | null>(null);
  const move = useRef<Move>(null);
  const agentAddress = useRef<`0x${string}` | null>(null);
  const knownIds = useRef<Set<string>>(new Set());
  const started = useRef<Set<StartStep>>(new Set());

  const update = useCallback((step: StartStep, status: StepStatus, id?: string) => {
    setRun((r) => (r ? setStep(r, step, status, id) : r));
  }, []);

  const listIds = useCallback(async (post: PostInput, address: string): Promise<Set<string>> => {
    if (post.kind === 'request') {
      const r = await api.buyer(address);
      return new Set(r.jobs.map((j) => j.jobId.toLowerCase()));
    }
    const r = await api.listingsForSeller(address);
    return new Set(r.listings.map((l) => l.id));
  }, []);

  const findCreated = useCallback(async (post: PostInput, address: string): Promise<string | null> => {
    if (post.kind === 'request') {
      const r = await api.buyer(address);
      const hit = r.jobs.find(
        (j) => !knownIds.current.has(j.jobId.toLowerCase()) && (j.briefText ?? '').trim() === post.brief.trim(),
      );
      return hit?.jobId ?? null;
    }
    const r = await api.listingsForSeller(address);
    const hit = r.listings.find((l) => !knownIds.current.has(l.id) && l.title === post.title);
    return hit?.id ?? null;
  }, []);

  const doStep = useCallback(
    async (step: StartStep) => {
      const address = auth.address;
      const post = input.current;
      if (!address || !post || started.current.has(step)) return;
      started.current.add(step);
      update(step, 'running');

      if (step === 'setup') {
        try {
          const res = await activation.activate();
          agentAddress.current = (res?.agents?.buyer as `0x${string}` | undefined) ?? agentAddress.current;
          update('setup', 'done');
        } catch (err) {
          update('setup', refused(err) ? 'failed' : 'slow');
        }
        return;
      }

      if (step === 'move') {
        const m = move.current;
        const agent = agentAddress.current ?? (activation.agents?.buyer as `0x${string}` | undefined) ?? null;
        if (!m || !agent) {
          update('move', 'failed');
          return;
        }
        await money.start({ move: 'topUp', agent: 'buyer', agentAddress: agent, amount: m.amount, source: m.source });
        return;
      }

      try {
        knownIds.current = await listIds(post, address).catch(() => new Set<string>());
        if (post.kind === 'request') {
          const { kind: _kind, ...body } = post;
          const r = await api.postJob({ posterAddress: address, ...body });
          update('post', 'done', r.jobId);
        } else {
          const { kind: _kind, ...body } = post;
          const r = await api.postListing({ sellerUser: address, ...body });
          update('post', 'done', r.listing.id);
        }
      } catch (err) {
        update('post', postOutcome(err instanceof ApiError ? { status: err.status, message: err.message } : null));
      }
    },
    [auth.address, activation, money, listIds, update],
  );

  // The money step reads the same driver the money sheet uses: confirmed is
  // done, a refusal or revert failed, anything slower waits.
  const moneyKind = money.state.kind;
  useEffect(() => {
    if (!started.current.has('move')) return;
    if (moneyKind === 'confirmed') update('move', 'done');
    else if (moneyKind === 'failed' || moneyKind === 'reverted') update('move', 'failed');
    else if (moneyKind === 'slow') update('move', 'slow');
  }, [moneyKind, update]);

  // Leaving mid-run cannot undo a move that is already on its way; ask first.
  const inFlight = run ? runBusy(run) : false;
  useEffect(() => {
    if (!inFlight) return;
    const hold = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener('beforeunload', hold);
    return () => window.removeEventListener('beforeunload', hold);
  }, [inFlight]);

  useEffect(() => {
    if (!run) return;
    const next = nextStep(run);
    if (next) void doStep(next);
  }, [run, doStep]);

  const begin = useCallback(
    (steps: StartStep[], post: PostInput, m: Move) => {
      input.current = post;
      move.current = m;
      started.current = new Set();
      money.reset();
      setRun(initRun(steps));
    },
    [money],
  );

  const checkAgain = useCallback(async () => {
    const slow = run?.steps.find((s) => s.status === 'slow');
    const address = auth.address;
    const post = input.current;
    if (!slow || !address || !post) return;
    if (slow.step === 'move') {
      await money.checkAgain();
      return;
    }
    if (slow.step === 'setup') {
      const status = await api.activationStatus(address).catch(() => null);
      if (status?.activated) {
        agentAddress.current = (status.agents?.buyer as `0x${string}` | undefined) ?? agentAddress.current;
        update('setup', 'done');
      }
      return;
    }
    const id = await findCreated(post, address).catch(() => null);
    if (id) update('post', 'done', id);
  }, [run, auth.address, money, findCreated, update]);

  const reset = useCallback(() => {
    setRun(null);
    input.current = null;
    started.current = new Set();
    money.reset();
  }, [money]);

  return {
    run,
    begin,
    checkAgain,
    reset,
    busy: inFlight,
    closable: run ? runClosable(run) : true,
    finished: run ? runFinished(run) : false,
  };
}
