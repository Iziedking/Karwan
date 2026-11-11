'use client';
import { MoneyInput } from '@/features/money/components/MoneyInput';

import { useId, useRef, useState, type ReactNode } from 'react';
import { api, type UserProfile } from '@/core/api';
import { waysOf, type TypedPrice } from '@/features/profile/ways';
import { ConfirmSheetShell } from '@/shared/components/ConfirmSheetShell';
import type { YourAgentCopy } from '@/shared/i18n/messages/yourAgent';
import type { SetupCopy } from '@/shared/i18n/messages/setup';
import { cn } from '@/shared/utils/cn';
import { daysOf, daysProblem, mainWay, paidKindOf, priceProblem, withPaid, withPrice, type PaidKind } from './yourAgentModel';

export type PanelKey = 'sell' | 'price' | 'paid' | 'alone' | 'buy';
type AgentMode = 'offers' | 'ask' | 'agree';

const input = 'form-input mt-1.5 w-full';
const label = 'block text-[14px] font-semibold text-[var(--lp-dark)]';

/// One change, opened over the Your agent page: a title, the boxes, and Save.
function Panel({ title, busy, error, onClose, onSave, t, children }: {
  title: string;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onSave: () => void;
  t: YourAgentCopy;
  children: ReactNode;
}) {
  const id = useId();
  return (
    <ConfirmSheetShell open labelledBy={id} busy={busy} onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSave();
        }}
      >
        <h2 id={id} className="text-[20px] font-semibold text-[var(--lp-dark)]">{title}</h2>
        <div className="mt-4 space-y-4">{children}</div>
        {error ? <p role="alert" className="mt-4 text-[14px] font-medium text-[var(--color-critical)]">{error}</p> : null}
        <div className="mt-5 grid gap-2">
          <button type="submit" disabled={busy} className="min-h-12 rounded-full bg-[var(--lp-accent)] px-5 text-[15px] font-semibold text-[var(--accent-ink)] disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-dark)]">
            {busy ? t.saving : t.save}
          </button>
          <button type="button" disabled={busy} onClick={onClose} className="min-h-12 rounded-full border border-[var(--lp-border-light)] px-5 text-[15px] font-semibold text-[var(--lp-dark)] hover:bg-[var(--lp-light)] disabled:opacity-50">
            {t.cancel}
          </button>
        </div>
      </form>
    </ConfirmSheetShell>
  );
}

/// A price the agent works with, typed in the person's own currency (view 55).
function MoneyField({ name, value, onChange, onTyped, note }: { name: string; value: string; onChange: (v: string) => void; onTyped?: (typed: TypedPrice | null) => void; note?: string }) {
  return (
    <label className={label}>
      {name}
      <MoneyInput value={value} onTyped={onTyped} onChange={(usdc) => onChange(usdc === null ? '' : String(usdc))} className={input} />
      {note ? <span className="mt-1 block text-[13px] font-medium text-[var(--lp-text-sub)]">{note}</span> : null}
    </label>
  );
}

function NumberField({ name, value, onChange, note }: { name: string; value: string; onChange: (v: string) => void; note?: string }) {
  return (
    <label className={label}>
      {name}
      <input type="number" inputMode="decimal" min={0} step="any" value={value} onChange={(e) => onChange(e.target.value)} className={input} />
      {note ? <span className="mt-1 block text-[13px] font-medium text-[var(--lp-text-sub)]">{note}</span> : null}
    </label>
  );
}

function TextField({ name, value, onChange, note, multiline = false }: { name: string; value: string; onChange: (v: string) => void; note?: string; multiline?: boolean }) {
  return (
    <label className={label}>
      {name}
      {multiline ? (
        <textarea value={value} onChange={(e) => onChange(e.target.value)} rows={3} dir="auto" className={cn(input, 'form-textarea')} />
      ) : (
        <input value={value} onChange={(e) => onChange(e.target.value)} dir="auto" className={input} />
      )}
      {note ? <span className="mt-1 block text-[13px] font-medium text-[var(--lp-text-sub)]">{note}</span> : null}
    </label>
  );
}

function Choice<T extends string>({ value, options, onChange, legend }: { value: T | null; options: { value: T; label: string; note: string }[]; onChange: (v: T) => void; legend: string }) {
  return (
    <fieldset>
      <legend className="sr-only">{legend}</legend>
      <div className="grid gap-2">
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={value === o.value}
            onClick={() => onChange(o.value)}
            className={cn(
              'rounded-[14px] border px-4 py-3 text-start transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-accent)]',
              value === o.value ? 'border-[var(--lp-accent)] bg-[var(--offer-surface)]' : 'border-[var(--lp-border-light)] hover:bg-[var(--lp-light)]',
            )}
          >
            <span className="block text-[15px] font-semibold text-[var(--lp-dark)]">{o.label}</span>
            <span className="mt-0.5 block text-[13px] font-medium text-[var(--lp-text-sub)]">{o.note}</span>
          </button>
        ))}
      </div>
    </fieldset>
  );
}

const num = (s: string) => (s.trim() === '' ? Number.NaN : Number(s));
const text = (n: number | undefined) => (n === undefined || !Number.isFinite(n) ? '' : String(n));

/// Saves and hands back the stored profile, or the words to show.
function useSave(t: YourAgentCopy, onSaved: (p: UserProfile) => void, onClose: () => void) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function run(save: () => Promise<{ profile: UserProfile }>) {
    setBusy(true);
    setError(null);
    try {
      const { profile } = await save();
      onSaved(profile);
      onClose();
    } catch {
      setError(t.failed);
    } finally {
      setBusy(false);
    }
  }
  return { busy, error, setError, run };
}

/// The seller and buyer settings as Edit profile sends them, with one side changed.
function profileBody(profile: UserProfile, change: Pick<UserProfile, 'seller' | 'buyer'>) {
  return {
    address: profile.address,
    role: profile.role,
    accountKind: profile.accountKind ?? 'person',
    displayName: profile.displayName,
    ...((change.seller ?? profile.seller) ? { seller: change.seller ?? profile.seller } : {}),
    ...((change.buyer ?? profile.buyer) ? { buyer: change.buyer ?? profile.buyer } : {}),
  } as Parameters<typeof api.saveProfile>[0];
}

export function AgentPanel({ open, profile, t, own, onClose, onSaved }: {
  open: PanelKey;
  profile: UserProfile;
  t: YourAgentCopy;
  own: SetupCopy['choices']['own'];
  onClose: () => void;
  onSaved: (p: UserProfile) => void;
}) {
  const { busy, error, setError, run } = useSave(t, onSaved, onClose);
  const ways = waysOf(profile);
  const main = mainWay(ways);
  const days = daysOf(main);
  const seller = profile.seller;

  const [skills, setSkills] = useState(seller?.skills.join(', ') ?? '');
  const [bio, setBio] = useState(seller?.bio ?? '');
  const [usual, setUsual] = useState(main && !main.usualGuessed ? text(main.priceUsual) : '');
  const [lowest, setLowest] = useState(text(main?.priceMin));
  const typedPrice = useRef<{ lowest?: TypedPrice | null; usual?: TypedPrice | null }>({});
  const [kind, setKind] = useState<PaidKind | null>(paidKindOf(ways));
  const [daysMin, setDaysMin] = useState(text(days?.min));
  const [daysMax, setDaysMax] = useState(text(days?.max));
  const [what, setWhat] = useState(main?.shape === 'goods' ? main.what : seller?.skills[0] ?? '');
  const [shipsTo, setShipsTo] = useState(main?.shape === 'goods' ? main.shipsTo : '');
  const [mode, setMode] = useState<AgentMode>(profile.agentPrefs?.agentMode ?? 'offers');
  const [maxPrice, setMaxPrice] = useState(text(profile.buyer?.maxBudgetUsdc));
  const [wait, setWait] = useState(text(profile.buyer?.maxDeadlineDays));

  if (open === 'sell' && seller) {
    return (
      <Panel title={t.rows.sell} busy={busy} error={error} onClose={onClose} t={t} onSave={() => {
        const list = skills.split(',').map((s) => s.trim()).filter(Boolean);
        if (!list.length) return setError(t.problems.missing);
        void run(() => api.saveProfile(profileBody(profile, { seller: { ...seller, skills: list, bio: bio.trim() } })));
      }}>
        <TextField name={t.fields.skills} value={skills} onChange={setSkills} note={t.fields.skillsHint} />
        <TextField name={t.fields.description} value={bio} onChange={setBio} multiline />
      </Panel>
    );
  }

  if (open === 'price') {
    return (
      <Panel title={t.rows.price} busy={busy} error={error} onClose={onClose} t={t} onSave={() => {
        const problem = priceProblem(num(lowest), num(usual));
        if (problem) return setError(problem === 'order' ? t.problems.order : t.problems.missing);
        void run(() => api.saveWays(withPrice(ways, { lowest: num(lowest), usual: num(usual) }, typedPrice.current)));
      }}>
        <MoneyField name={t.fields.usual} value={usual} onChange={setUsual} onTyped={(typed) => { typedPrice.current.usual = typed; }} />
        <MoneyField name={t.fields.lowest} value={lowest} onChange={setLowest} onTyped={(typed) => { typedPrice.current.lowest = typed; }} note={t.fields.lowestNote} />
      </Panel>
    );
  }

  if (open === 'paid') {
    const kinds: PaidKind[] = ['one_time', 'milestones', 'goods'];
    return (
      <Panel title={t.rows.paid} busy={busy} error={error} onClose={onClose} t={t} onSave={() => {
        if (!kind) return setError(t.problems.missing);
        const d = daysProblem(num(daysMin), num(daysMax));
        if (d) return setError(d === 'order' ? t.problems.daysOrder : t.problems.missing);
        if (kind === 'goods' && (!what.trim() || !shipsTo.trim())) return setError(t.problems.missing);
        void run(() => api.saveWays(withPaid(ways, { kind, daysMin: num(daysMin), daysMax: num(daysMax), what, shipsTo })));
      }}>
        <Choice legend={t.rows.paid} value={kind} onChange={setKind} options={kinds.map((k) => ({ value: k, label: t.kinds[k], note: t.kindNotes[k] }))} />
        {kind === 'goods' ? (
          <>
            <TextField name={t.fields.what} value={what} onChange={setWhat} />
            <TextField name={t.fields.shipsTo} value={shipsTo} onChange={setShipsTo} />
          </>
        ) : null}
        <div className="grid grid-cols-2 gap-3">
          <NumberField name={t.fields.daysMin} value={daysMin} onChange={setDaysMin} />
          <NumberField name={t.fields.daysMax} value={daysMax} onChange={setDaysMax} />
        </div>
      </Panel>
    );
  }

  if (open === 'alone') {
    const modes: AgentMode[] = ['offers', 'ask', 'agree'];
    return (
      <Panel title={t.rows.alone} busy={busy} error={error} onClose={onClose} t={t} onSave={() => void run(() => api.saveAgentMode(mode))}>
        <p className="text-[14px] font-medium text-[var(--lp-text-sub)]">{own.help}</p>
        <Choice legend={t.rows.alone} value={mode} onChange={setMode} options={modes.map((m) => ({ value: m, label: own.options[m].label, note: own.options[m].note }))} />
      </Panel>
    );
  }

  if (open === 'buy' && profile.buyer) {
    const buyer = profile.buyer;
    return (
      <Panel title={t.rows.buy} busy={busy} error={error} onClose={onClose} t={t} onSave={() => {
        const most = num(maxPrice);
        const within = num(wait);
        if (!(most > 0) || !Number.isInteger(within) || within < 1) return setError(t.problems.missing);
        void run(() => api.saveProfile(profileBody(profile, { buyer: { ...buyer, maxBudgetUsdc: most, maxDeadlineDays: Math.max(within, buyer.minDeadlineDays) } })));
      }}>
        <MoneyField name={t.fields.maxPrice} value={maxPrice} onChange={setMaxPrice} />
        <NumberField name={t.fields.waitDays} value={wait} onChange={setWait} />
      </Panel>
    );
  }

  return null;
}
