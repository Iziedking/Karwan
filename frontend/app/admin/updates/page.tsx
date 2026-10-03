'use client';
import { useCallback, useEffect, useState } from 'react';
import { api, ApiError, type AdminUpdateCard, type TrendingCategory, type UpdateGround, type UpdateInput, type UpdateKind } from '@/core/api';
import { useDialog } from '@/shared/components/Dialog';
import { UpdateTile } from '@/features/home/components/UpdatesCarousel';

/// The home Updates cards. What is published here shows on every signed-in
/// home page, in this order. A link is a Karwan path (/how-it-works) or an
/// https address (an Arc House post, a video).

const GROUNDS: Array<{ value: UpdateGround; label: string }> = [
  { value: 'mist', label: 'Mist blue' },
  { value: 'sage', label: 'Sage' },
  { value: 'blush', label: 'Blush' },
  { value: 'lilac', label: 'Lilac' },
  { value: 'paper', label: 'Paper' },
];
const KINDS: Array<{ value: UpdateKind; label: string }> = [
  { value: 'post', label: 'Post or page' },
  { value: 'video', label: 'Video' },
  { value: 'trending', label: 'Trending on Karwan (live)' },
];

const EMPTY: UpdateInput = { kind: 'post', tag: '', title: '', body: '', ctaLabel: 'Read more', href: '', ground: 'mist', art: 0, active: true };

const inputClass = 'mt-1.5 w-full bg-[#0e0e0e] border border-white/15 rounded-lg px-3 py-2.5 text-[14px] focus:border-white/40 outline-none';
const labelClass = 'text-[12px] font-semibold text-white/55';
const smallButton = 'min-h-9 rounded-lg border border-white/15 px-3 text-[12px] font-semibold text-white/80 hover:border-white/40 disabled:opacity-30';

export default function AdminUpdatesPage() {
  const { confirm } = useDialog();
  const [cards, setCards] = useState<AdminUpdateCard[] | null>(null);
  const [trending, setTrending] = useState<TrendingCategory[]>([]);
  const [form, setForm] = useState<UpdateInput>(EMPTY);
  const [editing, setEditing] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    api.adminListUpdates()
      .then((r) => { setCards(r.cards); setTrending(r.trending); setErr(null); })
      .catch((e) => setErr(e instanceof ApiError ? e.message : 'Could not load the cards'));
  }, []);
  useEffect(load, [load]);

  const set = <K extends keyof UpdateInput>(key: K, value: UpdateInput[K]) => setForm((f) => ({ ...f, [key]: value }));

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    setErr(null);
    try {
      if (editing) await api.adminPatchUpdate(editing, form);
      else await api.adminCreateUpdate(form);
      setForm(EMPTY);
      setEditing(null);
      load();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Could not save this card');
    } finally {
      setSaving(false);
    }
  }

  async function move(index: number, by: -1 | 1) {
    if (!cards) return;
    const ids = cards.map((c) => c.id);
    const target = index + by;
    if (target < 0 || target >= ids.length) return;
    [ids[index], ids[target]] = [ids[target]!, ids[index]!];
    try {
      setCards((await api.adminReorderUpdates(ids)).cards);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Could not reorder');
    }
  }

  async function toggle(card: AdminUpdateCard) {
    try {
      await api.adminPatchUpdate(card.id, { active: !card.active });
      load();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Could not change this card');
    }
  }

  async function remove(card: AdminUpdateCard) {
    const ok = await confirm({ title: 'Delete this card', message: `"${card.title}" leaves the home page for everyone. This cannot be undone.`, confirmLabel: 'Delete', danger: true });
    if (!ok) return;
    try {
      await api.adminDeleteUpdate(card.id);
      if (editing === card.id) { setEditing(null); setForm(EMPTY); }
      load();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Could not delete this card');
    }
  }

  function edit(card: AdminUpdateCard) {
    const { id: _id, order: _o, createdAt: _c, updatedAt: _u, ...input } = card;
    setForm(input);
    setEditing(card.id);
  }

  const preview = { ...form, id: 'preview', order: 0, title: form.title || 'Card title', tag: form.tag || 'Tag', ctaLabel: form.ctaLabel || 'Read more', href: form.href || '/' };

  return (
    <div>
      <h1 className="font-sans text-[24px] font-extrabold">Home updates</h1>
      <p className="mt-2 max-w-[68ch] text-[13px] text-white/55">
        Cards in the Updates row on every signed-in home page, in this order. Link to a Karwan page like /how-it-works or an https address such as an Arc House post or a video. Keep figures real: a Trending card fills itself from this week&apos;s requests.
      </p>
      {err ? <p role="alert" className="mt-4 rounded-lg border border-[#e0794f]/30 bg-[#e0794f]/10 px-3 py-2 text-[12px] text-[#e0794f]">{err}</p> : null}

      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
        <form onSubmit={save} className="rounded-xl border border-white/10 bg-[#161616] p-5">
          <p className="text-[14px] font-semibold">{editing ? 'Edit card' : 'New card'}</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <fieldset><legend className={labelClass}>Kind</legend>
              <Segmented options={KINDS} value={form.kind} onChange={(v) => set('kind', v)} />
            </fieldset>
            <label className="block"><span className={labelClass}>Tag</span>
              <input value={form.tag} onChange={(e) => set('tag', e.target.value)} maxLength={40} placeholder="Arc House · Tech" className={inputClass} />
            </label>
          </div>
          <label className="mt-3 block"><span className={labelClass}>Title</span>
            <input value={form.title} onChange={(e) => set('title', e.target.value)} maxLength={60} placeholder="Built on Arc" className={inputClass} />
          </label>
          {form.kind !== 'trending' ? (
            <label className="mt-3 block"><span className={labelClass}>Short text ({form.body.length}/160)</span>
              <textarea value={form.body} onChange={(e) => set('body', e.target.value)} maxLength={160} rows={2} className={inputClass} />
            </label>
          ) : null}
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="block"><span className={labelClass}>Button</span>
              <input value={form.ctaLabel} onChange={(e) => set('ctaLabel', e.target.value)} maxLength={24} className={inputClass} />
            </label>
            <label className="block"><span className={labelClass}>Link</span>
              <input value={form.href} onChange={(e) => set('href', e.target.value)} maxLength={500} placeholder="/how-it-works or https://…" className={inputClass} />
            </label>
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <fieldset><legend className={labelClass}>Colour</legend>
              <div className="mt-1.5 flex gap-2">
                {GROUNDS.map((g) => (
                  <button key={g.value} type="button" onClick={() => set('ground', g.value)} aria-label={g.label} aria-pressed={form.ground === g.value}
                    className={`size-9 rounded-full border-2 ${form.ground === g.value ? 'border-[#AFC95B]' : 'border-white/15'}`}
                    style={{ background: `var(--update-${g.value})` }} />
                ))}
              </div>
            </fieldset>
            <fieldset><legend className={labelClass}>Art</legend>
              <Segmented options={[{ value: 0, label: 'Circles' }, { value: 1, label: 'Arch' }, { value: 2, label: 'Diamond' }] as const} value={form.art} onChange={(v) => set('art', v)} />
            </fieldset>
            <label className="flex items-end gap-2 pb-3 text-[13px]">
              <input type="checkbox" checked={form.active !== false} onChange={(e) => set('active', e.target.checked)} className="size-4 accent-[#AFC95B]" />
              Show on home
            </label>
          </div>
          <div className="mt-5 flex flex-wrap gap-3">
            <button type="submit" disabled={saving || !form.title.trim() || !form.tag.trim() || !form.href.trim()} className="min-h-11 rounded-lg bg-[#AFC95B] px-5 text-[14px] font-semibold text-[#0e0e0e] disabled:opacity-40">
              {saving ? 'Saving' : editing ? 'Save changes' : 'Publish card'}
            </button>
            {editing ? <button type="button" onClick={() => { setEditing(null); setForm(EMPTY); }} className={smallButton}>Cancel</button> : null}
          </div>
        </form>

        <div>
          <p className={labelClass}>Preview</p>
          <div className="mt-2 rounded-xl bg-[#EEF0F2] p-4">
            <UpdateTile card={preview} trending={trending} index={0} total={1} />
          </div>
        </div>
      </div>

      <h2 className="mt-8 text-[16px] font-semibold">Published order</h2>
      {cards === null ? <p className="mt-3 text-[13px] text-white/45">Loading</p> : null}
      <ul className="mt-3 space-y-2">
        {(cards ?? []).map((card, index) => (
          <li key={card.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-white/10 bg-[#161616] px-4 py-3">
            <span className="w-6 text-[13px] tabular-nums text-white/40">{index + 1}</span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[14px] font-semibold">{card.title}</span>
              <span className="block truncate text-[12px] text-white/45">{card.tag} · {card.href}{card.active ? '' : ' · hidden'}</span>
            </span>
            <button type="button" onClick={() => move(index, -1)} disabled={index === 0} aria-label={`Move ${card.title} up`} className={smallButton}>Up</button>
            <button type="button" onClick={() => move(index, 1)} disabled={index === (cards?.length ?? 0) - 1} aria-label={`Move ${card.title} down`} className={smallButton}>Down</button>
            <button type="button" onClick={() => toggle(card)} className={smallButton}>{card.active ? 'Hide' : 'Show'}</button>
            <button type="button" onClick={() => edit(card)} className={smallButton}>Edit</button>
            <button type="button" onClick={() => remove(card)} className={`${smallButton} text-[#e0794f]`}>Delete</button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Segmented<T extends string | number>({ options, value, onChange }: {
  options: ReadonlyArray<{ value: T; label: string }>;
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div className="mt-1.5 flex flex-wrap gap-1.5">
      {options.map((o) => (
        <button key={String(o.value)} type="button" onClick={() => onChange(o.value)} aria-pressed={value === o.value}
          className={`min-h-10 rounded-lg border px-3 text-[13px] font-semibold ${value === o.value ? 'border-[#AFC95B] bg-[#AFC95B]/15 text-white' : 'border-white/15 text-white/70 hover:border-white/40'}`}>
          {o.label}
        </button>
      ))}
    </div>
  );
}
