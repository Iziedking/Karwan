'use client';
import { useEffect, useId, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/core/api';
import { useAuth } from '@/shared/hooks/useAuth';
import { useActivation } from '@/shared/hooks/useActivation';
import { useUserProfile } from '@/shared/hooks/useUserProfile';
import { useMoneyBalances } from '@/features/money/hooks/useMoneyBalances';
import { useTranslations } from '@/shared/i18n/LocaleProvider';
import { fill } from '@/features/deals/workspace/presentation';
import { ActivationGate } from '@/shared/components/ActivationGate';
import { DirectDealComposer } from '@/features/deals/components/DirectDealComposer';
import { ALERT, FIELD, LINK, PRIMARY } from '@/shared/ui/controls';
import { startPlan, type StartPlan } from '../startPlan';
import { BRIEF_MAX, parseSplit, requestErrors } from '../formRules';
import { useStartRun } from '../hooks/useStartRun';
import { requestTitle } from '../requestTitle';
import { requestLineState, type RequestLineState } from '../requestView';
import { StartSheet } from './StartSheet';

type StateKeys = keyof ReturnType<typeof useTranslations>['search']['request']['states'];

const LINE_COPY: Record<RequestLineState, StateKeys> = {
  funded: 'funded',
  cancelled: 'cancelled',
  expired: 'expired',
  declined: 'declined',
  matchFound: 'matchWaitingSellerBuyer',
  closing: 'closing',
  offersArriving: 'offersArriving',
  looking: 'looking',
};

/// The personal buyer desk: say what you need, the most you will pay and when,
/// and the agent looks. The first press sets up the agents and moves the
/// money when it has to, in one sheet that says so before it happens.
export function FindSellerPage() {
  const t = useTranslations().search;
  const router = useRouter();
  const auth = useAuth();
  const activation = useActivation();
  const profile = useUserProfile();
  const balances = useMoneyBalances();
  const ids = { need: useId(), budget: useId(), when: useId(), room: useId(), split: useId() };

  const [need, setNeed] = useState('');
  const [budget, setBudget] = useState('');
  const [days, setDays] = useState('');
  const [more, setMore] = useState(false);
  const [room, setRoom] = useState('');
  const [split, setSplit] = useState('');
  const [proven, setProven] = useState(false);
  const [tried, setTried] = useState(false);
  const [open, setOpen] = useState(false);
  const start = useStartRun();

  const qc = useQueryClient();
  const [runPlan, setRunPlan] = useState<StartPlan | null>(null);
  const budgetN = Number(budget);
  const daysN = Number(days);
  const roomN = room.trim() === '' ? null : Number(room);
  const splitPcts = split.trim() === '' ? null : parseSplit(split);
  const invalid = new Set(requestErrors({ need, budget, days, room, split }));
  const errors = {
    need: invalid.has('need') ? t.find.errors.need : null,
    budget: invalid.has('budget') ? t.find.errors.budget : null,
    when: invalid.has('when') ? t.find.errors.when : null,
    room: invalid.has('room') ? t.find.errors.room : null,
    split: invalid.has('split') ? t.find.errors.split : null,
  };
  const valid = invalid.size === 0;

  const quote = useQuery({
    queryKey: ['search', 'fundingQuote', auth.address, budgetN],
    queryFn: () => api.fundingQuote(budgetN),
    enabled: open && valid && !!auth.address,
    staleTime: 10_000,
  });
  const livePlan = startPlan({
    kind: 'request',
    activated: activation.loading ? null : activation.activated,
    hasRoleProfile: profile.loading ? null : !!profile.profile?.buyer,
    // A quote being refetched is not a quote: never offer a move on stale numbers.
    topUpNeededUsdc: quote.data && !quote.isFetching ? Number(quote.data.topUpNeededUsdc) : null,
    balance: balances.balance,
    pool: balances.pool ?? 0,
  });

  const requests = useQuery({
    queryKey: ['search', 'myRequests', auth.address],
    queryFn: () => api.buyer(auth.address!).then((r) => r.jobs),
    enabled: !!auth.address,
    staleTime: 15_000,
  });
  const lines = useMemo(() => {
    const now = Date.now();
    return [...(requests.data ?? [])]
      .sort((a, b) => b.deadlineUnix - a.deadlineUnix)
      .map((job) => ({ job, title: requestTitle(job.briefText), state: requestLineState(job, now) }));
  }, [requests.data]);

  const createdId = start.run?.createdId ?? null;
  useEffect(() => {
    if (start.finished && createdId) router.push(`/jobs/${createdId}`);
  }, [start.finished, createdId, router]);

  // Once a run starts, the sheet keeps the plan it was started with: the live
  // plan recomputes against a balance the move has already spent.
  const plan = start.run && runPlan ? runPlan : livePlan;

  const onStart = () => {
    setTried(true);
    if (start.run || valid) setOpen(true);
  };
  const retry = () => {
    start.reset();
    setRunPlan(null);
    // Money may already be with the agent; ask again before offering to move any.
    void qc.invalidateQueries({ queryKey: ['search', 'fundingQuote'] });
  };
  const begin = () => {
    if (plan.kind !== 'ready') return;
    setRunPlan(plan);
    start.begin(
      plan.steps,
      {
        kind: 'request',
        brief: need.trim(),
        budgetUsdc: budgetN,
        deadlineDays: daysN,
        negotiationMaxIncreasePct: roomN ?? undefined,
        trustedMatch: proven || undefined,
        milestonePcts: splitPcts ?? undefined,
      },
      plan.moveUsdc && plan.source ? { amount: plan.moveUsdc, source: plan.source } : null,
    );
  };
  const err = (key: keyof typeof errors) =>
    tried && errors[key] ? <p className={`${ALERT} mt-2`}>{errors[key]}</p> : null;

  return (
    <div className="product-surface mx-auto max-w-[720px] px-4 pb-24 pt-6 sm:px-6">
      <div className="divide-y divide-[var(--lp-border-light)] [&>*]:py-8">
        <section aria-labelledby="find-title" className="space-y-5">
          <h1 id="find-title" className="text-[28px] font-semibold tracking-[-0.02em] text-[var(--lp-dark)]">{t.find.title}</h1>
          <div>
            <label htmlFor={ids.need} className="text-[14px] font-semibold text-[var(--lp-dark)]">{t.find.need}</label>
            <textarea id={ids.need} value={need} onChange={(e) => setNeed(e.target.value)} rows={3} maxLength={BRIEF_MAX} className={`${FIELD} mt-2 py-3`} />
            {err('need')}
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="min-w-0">
              <label htmlFor={ids.budget} className="text-[14px] font-semibold text-[var(--lp-dark)]">{t.find.budget}</label>
              <div className="mt-2 flex items-center gap-2">
                <input id={ids.budget} inputMode="decimal" value={budget} onChange={(e) => setBudget(e.target.value)} className={`${FIELD} min-w-0 tabular-nums`} />
                <span className="text-[14px] font-semibold text-[var(--lp-text-sub)]">USDC</span>
              </div>
              {err('budget')}
            </div>
            <div className="min-w-0">
              <label htmlFor={ids.when} className="text-[14px] font-semibold text-[var(--lp-dark)]">{t.find.when}</label>
              <div className="mt-2 flex items-center gap-2">
                <input id={ids.when} inputMode="numeric" value={days} onChange={(e) => setDays(e.target.value)} className={`${FIELD} min-w-0 tabular-nums`} />
                <span className="text-[14px] text-[var(--lp-text-sub)]">{t.find.days}</span>
              </div>
              {err('when')}
            </div>
          </div>
          <div>
            <button
              type="button"
              aria-expanded={more}
              onClick={() => setMore((v) => !v)}
              className="flex min-h-11 w-full items-center justify-between text-[14px] font-semibold text-[var(--lp-dark)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
            >
              {t.find.moreTerms}
              <span aria-hidden>{more ? '−' : '+'}</span>
            </button>
            {more ? (
              <div className="mt-3 space-y-4">
                <div>
                  <label htmlFor={ids.room} className="text-[14px] text-[var(--lp-dark)]">{t.find.room}</label>
                  <div className="mt-2 flex items-center gap-2">
                    <input id={ids.room} inputMode="numeric" value={room} onChange={(e) => setRoom(e.target.value)} className={`${FIELD} max-w-[120px] tabular-nums`} />
                    <span className="text-[14px] text-[var(--lp-text-sub)]">{t.find.roomUnit}</span>
                  </div>
                  {err('room')}
                </div>
                <div>
                  <label htmlFor={ids.split} className="text-[14px] text-[var(--lp-dark)]">{t.find.split}</label>
                  <input id={ids.split} value={split} onChange={(e) => setSplit(e.target.value)} placeholder="50, 50" className={`${FIELD} mt-2 tabular-nums`} />
                  {err('split')}
                </div>
                <label className="flex min-h-11 items-center gap-3 text-[14px] text-[var(--lp-dark)]">
                  <input type="checkbox" checked={proven} onChange={(e) => setProven(e.target.checked)} className="size-5 accent-[var(--accent)]" />
                  {t.find.provenOnly}
                </label>
              </div>
            ) : null}
          </div>
          <button type="button" className={`${PRIMARY} w-full sm:w-auto`} onClick={onStart}>{t.find.start}</button>
          <div>
            <Link href="/buyer?mode=direct" className={LINK}>{t.find.direct}</Link>
          </div>
        </section>

        <section aria-labelledby="my-requests" className="space-y-3">
          <h2 id="my-requests" className="text-[17px] font-semibold text-[var(--lp-dark)]">{t.find.requestsTitle}</h2>
          {requests.isError ? (
            <p role="alert" className={ALERT}>{t.find.requestsError}</p>
          ) : requests.isPending ? (
            <div aria-busy="true" className="h-12 rounded-md bg-[var(--lp-light)] motion-safe:animate-pulse" />
          ) : lines.length === 0 ? (
            <p className="text-[14px] text-[var(--lp-text-sub)]">{t.find.requestsEmpty}</p>
          ) : (
            <ul className="divide-y divide-[var(--lp-border-light)]">
              {lines.map(({ job, title, state }) => (
                <li key={job.jobId}>
                  <Link
                    href={`/jobs/${job.jobId}`}
                    className="flex min-h-14 items-center justify-between gap-4 py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-[15px] text-[var(--lp-dark)]">{title ?? t.request.aRequest}</span>
                      <span className="block text-[13px] text-[var(--lp-text-sub)]">
                        {fill(t.request.states[LINE_COPY[state]].headline, { count: job.bids.length })}
                      </span>
                    </span>
                    <span className="shrink-0 text-[15px] font-semibold tabular-nums text-[var(--lp-dark)]">{job.budgetUsdc} USDC</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <StartSheet
        open={open}
        onClose={() => {
          if (!start.closable) return;
          setOpen(false);
          // A run that is waiting stays, so reopening shows it rather than a
          // fresh press that could move money again.
          if (!start.run || start.finished) {
            start.reset();
            setRunPlan(null);
          }
        }}
        kind="request"
        lead={fill(t.sheet.requestLead, { amount: budgetN, days: daysN })}
        plan={plan}
        run={start.run}
        closable={start.closable}
        onBegin={begin}
        onCheckAgain={() => void start.checkAgain()}
        onTryAgain={retry}
      />
    </div>
  );
}

/// A direct deal keeps its own page and its existing activation step.
export function DirectDealOnly() {
  return (
    <div className="product-surface mx-auto max-w-[720px] px-4 pb-24 pt-6 sm:px-6">
      <ActivationGate>
        <DirectDealComposer />
      </ActivationGate>
    </div>
  );
}
