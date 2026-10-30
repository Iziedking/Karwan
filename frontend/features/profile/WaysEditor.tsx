'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '@/core/api';
import { qk } from '@/core/queryKeys';
import { useUserProfile } from '@/shared/hooks/useUserProfile';
import { useHydratedReducedMotion } from '@/shared/hooks/useHydratedReducedMotion';
import { useLocale } from '@/shared/i18n/LocaleProvider';
import { waysCopy, type WaysCopy } from '@/shared/i18n/messages/ways';
import { dur, ease } from '@/shared/motion/tokens';
import { cn } from '@/shared/utils/cn';
import { ProfileFrame, RowGroup } from './ui/ProfileUi';
import { ChoiceCard } from '@/features/setup/SetupParts';
import { blankWay, LIVE_SHAPES, TIME_SHAPES, wayProblem, waysOf, waySummary, type AgentWays, type BuyWay, type SellWay, type Side, type WayShape } from './ways';

type Way = SellWay | BuyWay;
type Open = { side: Side; shape: WayShape; draft: Way; isNew: boolean } | null;

const PRIMARY =
  'inline-flex min-h-11 items-center justify-center rounded-full bg-[var(--lp-accent)] px-6 text-[15px] font-semibold text-[var(--lp-band-dark)] transition-opacity disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-dark)]';
const QUIET =
  'inline-flex min-h-11 items-center justify-center rounded-full bg-[var(--tint)] px-5 text-[14px] font-semibold text-[var(--ink)] hover:bg-[var(--line)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]';

/// How a person deals, for selling and for buying (view 26). One row per way;
/// a row opens its answers in place. Saved whole with one Save.
export function WaysEditor() {
  const { locale } = useLocale();
  const c = waysCopy[locale as keyof typeof waysCopy] ?? waysCopy.en;
  const { profile, address, fetchState } = useUserProfile();
  const qc = useQueryClient();
  const reduce = useHydratedReducedMotion();
  const start = useMemo(() => waysOf(profile), [profile]);
  const [ways, setWays] = useState<AgentWays>(start);
  const [open, setOpen] = useState<Open>(null);
  const [adding, setAdding] = useState<Side | null>(null);
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | 'failed'>('idle');

  useEffect(() => setWays(start), [start]);

  const changed = JSON.stringify(ways) !== JSON.stringify(start);
  const motionProps = reduce
    ? {}
    : { initial: { opacity: 0, height: 0 }, animate: { opacity: 1, height: 'auto' }, exit: { opacity: 0, height: 0 }, transition: { duration: dur.fast, ease: ease.out } };

  function put(side: Side, shape: WayShape, way: Way | null) {
    setWays((cur) => {
      const list = (cur[side] as Way[]).filter((w) => w.shape !== shape);
      const at = (cur[side] as Way[]).findIndex((w) => w.shape === shape);
      const next = way ? (at < 0 ? [...list, way] : [...list.slice(0, at), way, ...list.slice(at)]) : list;
      return { ...cur, [side]: next } as AgentWays;
    });
    setState('idle');
  }

  async function save() {
    setState('saving');
    try {
      await api.saveWays(ways);
      await qc.invalidateQueries({ queryKey: qk.profile.me(address) });
      setState('saved');
    } catch {
      setState('failed');
    }
  }

  if (fetchState === 'loading' && !profile) {
    return (
      <ProfileFrame title={c.title} backHref="/profile">
        <div aria-hidden className="h-40 rounded-[18px] bg-[var(--lp-light)] motion-safe:animate-pulse" />
      </ProfileFrame>
    );
  }

  const section = (side: Side) => {
    const list = ways[side] as Way[];
    const free = (side === 'sell' ? [...LIVE_SHAPES, ...TIME_SHAPES] : [...LIVE_SHAPES]).filter((s) => !list.some((w) => w.shape === s));
    return (
      <RowGroup title={side === 'sell' ? c.selling : c.buying}>
        {list.length === 0 && open?.side !== side ? <p className="px-4 py-4 text-[15px] font-medium text-[var(--lp-text-sub)]">{c.none}</p> : null}
        {list.map((w) =>
          open && open.side === side && open.shape === w.shape && !open.isNew ? (
            <WayForm key={w.shape} side={side} open={open} c={c} motionProps={motionProps} onChange={(draft) => setOpen({ ...open, draft })} onDone={() => { put(side, w.shape, open.draft); setOpen(null); }} onCancel={() => setOpen(null)} onRemove={() => { put(side, w.shape, null); setOpen(null); }} />
          ) : (
            <button
              key={w.shape}
              type="button"
              onClick={() => { setAdding(null); setOpen({ side, shape: w.shape, draft: w, isNew: false }); }}
              className="flex min-h-[64px] w-full items-center gap-3 px-4 py-3 text-start transition-colors hover:bg-[var(--lp-light)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--accent)]"
            >
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-semibold text-[var(--lp-dark)]">{c.shapes[w.shape]}</span>
                <span className="mt-0.5 block break-words text-[14px] font-medium tabular-nums text-[var(--lp-text-sub)]">{waySummary(side, w, c)}</span>
              </span>
              <span className="shrink-0 text-[14px] font-semibold text-[var(--lp-dark)] underline-offset-4">{c.edit}</span>
            </button>
          ),
        )}
        {open && open.side === side && open.isNew ? (
          <WayForm side={side} open={open} c={c} motionProps={motionProps} onChange={(draft) => setOpen({ ...open, draft })} onDone={() => { put(side, open.shape, open.draft); setOpen(null); }} onCancel={() => setOpen(null)} />
        ) : null}
        <AnimatePresence initial={false}>
          {adding === side && !open ? (
            <motion.div key="add" {...motionProps} className="overflow-hidden">
              <div className="space-y-2 p-3">
                {free.map((shape) => (
                  <ChoiceCard
                    key={shape}
                    multi={false}
                    reduce={reduce}
                    on={false}
                    label={c.shapes[shape]}
                    note={side === 'sell' ? c.sellNotes[shape] : c.buyNotes[shape as keyof typeof c.buyNotes]}
                    onPick={() => { setAdding(null); setOpen({ side, shape, draft: blankWay(side, shape, ways), isNew: true }); }}
                  />
                ))}
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>
        {free.length && !open && adding !== side ? (
          <button
            type="button"
            onClick={() => setAdding(side)}
            className="flex min-h-[52px] w-full items-center px-4 text-start text-[15px] font-semibold text-[var(--lp-dark)] transition-colors hover:bg-[var(--lp-light)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--accent)]"
          >
            + {c.add}
          </button>
        ) : null}
      </RowGroup>
    );
  };

  return (
    <ProfileFrame title={c.title} hint={c.hint} backHref="/profile">
      {section('sell')}
      {section('buy')}
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={save} disabled={!changed || !!open || state === 'saving'} className={PRIMARY}>
          {state === 'saving' ? c.saving : c.save}
        </button>
        <p aria-live="polite" className={cn('text-[14px] font-medium', state === 'failed' ? 'text-[var(--color-critical)]' : 'text-[var(--lp-text-sub)]')}>
          {state === 'saved' ? c.saved : state === 'failed' ? c.failed : ''}
        </p>
      </div>
    </ProfileFrame>
  );
}

function WayForm({ side, open, c, motionProps, onChange, onDone, onCancel, onRemove }: {
  side: Side;
  open: NonNullable<Open>;
  c: WaysCopy;
  motionProps: Record<string, unknown>;
  onChange: (draft: Way) => void;
  onDone: () => void;
  onCancel: () => void;
  onRemove?: () => void;
}) {
  const w = open.draft as Record<string, unknown> & { shape: WayShape };
  const set = (key: string, value: unknown) => onChange({ ...w, [key]: value } as unknown as Way);
  const problem = wayProblem(side, open.draft);
  const f = c.fields;
  const num = (key: string, label: string, unit: string) => (
    <Field label={label}>
      <span className="flex items-center gap-2">
        <NumberBox value={w[key] as number} onChange={(n) => set(key, n)} label={label} />
        <span className="shrink-0 text-[14px] font-medium text-[var(--lp-text-sub)]">{unit}</span>
      </span>
    </Field>
  );
  // A goods way priced per item (view 41): a request that names a count is compared per item.
  const perItem = () => (
    <Field label={f.perItem} as="div">
      <label className="inline-flex min-h-11 items-center gap-3 text-[15px] text-[var(--lp-dark)]">
        <input type="checkbox" checked={w.perItem === true} onChange={(e) => set('perItem', e.target.checked)} className="size-5 accent-[var(--accent)]" />
        {c.perItemYes}
      </label>
    </Field>
  );
  const words = (key: string, label: string) => (
    <Field label={label}>
      <input value={(w[key] as string) ?? ''} maxLength={120} onChange={(e) => set(key, e.target.value)} className="form-input" />
    </Field>
  );

  let fields: ReactNode;
  if (side === 'sell') {
    if (w.shape === 'goods') fields = <>{words('what', f.whatSell)}{num('priceMin', f.priceFrom, 'USDC')}{num('priceUsual', f.priceUsual, 'USDC')}{perItem()}{words('shipsTo', f.shipsTo)}{num('arriveDaysMin', f.daysFrom, c.unitDays)}{num('arriveDaysMax', f.daysTo, c.unitDays)}</>;
    else if (w.shape === 'deposit') fields = <>{words('what', f.whatRent)}{num('deposit', f.deposit, 'USDC')}{num('periodDays', f.period, c.unitDays)}</>;
    else if (w.shape === 'hourly') fields = <>{num('rateMin', f.rateFrom, c.unitHour)}{num('rateUsual', f.rateUsual, c.unitHour)}{num('hoursMax', f.hoursMax, '')}</>;
    else if (w.shape === 'monthly') fields = <>{num('priceMin', f.priceFrom, c.unitMonth)}{num('priceUsual', f.priceUsual, c.unitMonth)}</>;
    else fields = <>{num('priceMin', f.priceFrom, 'USDC')}{num('priceUsual', f.priceUsual, 'USDC')}{num('daysMin', f.daysFrom, c.unitDays)}{num('daysMax', f.daysTo, c.unitDays)}{w.shape === 'milestones' ? num('stages', f.stages, '') : null}</>;
  } else {
    if (w.shape === 'goods') fields = <>{num('maxPrice', f.maxPrice, 'USDC')}{words('deliverTo', f.deliverTo)}{num('waitDays', f.waitDays, c.unitDays)}</>;
    else if (w.shape === 'deposit') fields = <>{num('maxDeposit', f.maxDeposit, 'USDC')}</>;
    else
      fields = (
        <>
          {num('maxPrice', f.maxPrice, 'USDC')}
          {num('needDays', f.needDays, c.unitDays)}
          {w.shape === 'milestones' ? (
            <Field label={f.pay} as="div">
              <span role="radiogroup" aria-label={f.pay} className="inline-flex rounded-full bg-[var(--tint)] p-1">
                {(['end', 'stages'] as const).map((p) => (
                  <button
                    key={p}
                    type="button"
                    role="radio"
                    aria-checked={w.pay === p}
                    onClick={() => set('pay', p)}
                    className={cn('min-h-10 rounded-full px-4 text-[14px] font-semibold transition-colors', w.pay === p ? 'bg-[var(--lp-card)] text-[var(--ink)] shadow-[0_0_0_1px_var(--lp-border-light)]' : 'text-[var(--ink-secondary)]')}
                  >
                    {p === 'end' ? c.payEnd : c.payStages}
                  </button>
                ))}
              </span>
            </Field>
          ) : null}
        </>
      );
  }

  return (
    <motion.div {...motionProps} className="overflow-hidden">
      <div className="space-y-4 bg-[var(--lp-light)] px-4 py-4">
        <p className="text-[15px] font-semibold text-[var(--lp-dark)]">{c.shapes[w.shape]}</p>
        <div className="grid gap-4 sm:grid-cols-2">{fields}</div>
        {problem ? <p className="text-[14px] font-medium text-[var(--color-critical)]">{problem === 'order' ? c.order : c.missing}</p> : null}
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={onDone} disabled={!!problem} className={PRIMARY}>{c.done}</button>
          <button type="button" onClick={onCancel} className={QUIET}>{c.cancel}</button>
          {onRemove ? (
            <button type="button" onClick={onRemove} className="ms-auto inline-flex min-h-11 items-center px-2 text-[14px] font-semibold text-[var(--color-critical)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]">
              {c.remove}
            </button>
          ) : null}
        </div>
      </div>
    </motion.div>
  );
}

function Field({ label, children, as = 'label' }: { label: string; children: ReactNode; as?: 'label' | 'div' }) {
  const Tag = as;
  return (
    <Tag className="block space-y-2">
      <span className="block text-[14px] font-semibold text-[var(--lp-dark)]">{label}</span>
      {children}
    </Tag>
  );
}

function NumberBox({ value, onChange, label }: { value: number; onChange: (n: number) => void; label: string }) {
  const [text, setText] = useState(() => (Number.isFinite(value) ? String(value) : ''));
  useEffect(() => setText(Number.isFinite(value) ? String(value) : ''), [value]);
  return (
    <input
      type="number"
      inputMode="decimal"
      aria-label={label}
      value={text}
      onChange={(e) => {
        setText(e.target.value);
        onChange(e.target.value.trim() === '' ? NaN : Number(e.target.value));
      }}
      className="form-input form-input-num min-w-0 flex-1"
    />
  );
}
