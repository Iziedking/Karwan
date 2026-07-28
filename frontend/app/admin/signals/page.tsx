'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  api,
  ApiError,
  type SignalImportance,
  type SignalOrigin,
  type SignalView,
} from '@/core/api';
import { useDialog } from '@/shared/components/Dialog';

/// The signal pipeline, and the form that feeds it.
///
/// Everything the newsletter and the social engine draft from arrives here
/// first. The form is the primary path by decision: Arc House is pasted in, not
/// scraped.
///
/// The screen is built around the take. A link with no take is a bookmark, and
/// the newsletter is only worth anyone's inbox because of what we say about the
/// thing rather than that we noticed it.

const IMPORTANCE: Array<{ value: SignalImportance; label: string }> = [
  { value: 'low', label: 'Low' },
  { value: 'normal', label: 'Normal' },
  { value: 'high', label: 'High' },
];

const ORIGIN_LABEL: Record<SignalOrigin, string> = {
  manual: 'Dropped',
  arc: 'Arc',
  circle: 'Circle',
  karwan: 'Karwan',
};

function when(ts: number): string {
  const days = Math.floor((Date.now() - ts) / 86_400_000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days}d ago`;
  return new Date(ts).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

const inputClass =
  'mt-1.5 w-full bg-[#0e0e0e] border border-white/15 rounded-lg px-3 py-2.5 text-[14px] focus:border-white/40 outline-none';
const labelClass = 'mono text-[10px] uppercase tracking-[0.12em] text-white/40';

export default function AdminSignalsPage() {
  const { confirm } = useDialog();
  const [signals, setSignals] = useState<SignalView[] | null>(null);
  const [excerptMax, setExcerptMax] = useState(1500);
  const [err, setErr] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [filter, setFilter] = useState<SignalOrigin | 'all'>('all');

  const [source, setSource] = useState('');
  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  const [publishedOn, setPublishedOn] = useState(today());
  const [summary, setSummary] = useState('');
  const [rawExcerpt, setRawExcerpt] = useState('');
  const [myTake, setMyTake] = useState('');
  const [tags, setTags] = useState('');
  const [importance, setImportance] = useState<SignalImportance>('normal');
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    api
      .adminListSignals()
      .then((r) => {
        setSignals(r.signals);
        setExcerptMax(r.limits.excerptMax);
        setErr(null);
      })
      .catch((e) => setErr(e instanceof ApiError ? e.message : 'Could not load the pipeline'));
  }, []);

  useEffect(load, [load]);

  async function drop(e: React.FormEvent) {
    e.preventDefault();
    if (saving || !source.trim() || !title.trim()) return;
    setSaving(true);
    setErr(null);
    setNotice(null);
    try {
      const r = await api.adminDropSignal({
        source: source.trim(),
        title: title.trim(),
        url: url.trim() || undefined,
        publishedOn,
        summary: summary.trim() || undefined,
        rawExcerpt: rawExcerpt.trim() || undefined,
        myTake: myTake.trim() || undefined,
        tags: tags
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean),
        importance,
      });

      setNotice(r.note ?? 'Added to the pipeline.');
      setTitle('');
      setUrl('');
      setSummary('');
      setRawExcerpt('');
      setMyTake('');
      setTags('');
      setPublishedOn(today());
      load();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Could not save this');
    } finally {
      setSaving(false);
    }
  }

  async function dismiss(signal: SignalView) {
    const ok = await confirm({
      title: 'Drop from the pipeline',
      message: `"${signal.title}" stops being drafted from. It is kept rather than deleted, so it stays in the record.`,
      confirmLabel: 'Drop',
      danger: true,
    });
    if (!ok) return;
    try {
      await api.adminDismissSignal(signal.id);
      load();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Could not dismiss this');
    }
  }

  const shown = useMemo(
    () => (signals ?? []).filter((s) => filter === 'all' || s.origin === filter),
    [signals, filter],
  );
  const withoutTake = (signals ?? []).filter((s) => !s.myTake).length;

  return (
    <div>
      <p className="mono text-[10px] uppercase tracking-[0.18em] text-white/40">[:SIGNALS:]</p>
      <h1 className="mt-2 font-sans text-[24px] font-extrabold">The pipeline</h1>
      <p className="mt-2 text-[13px] text-white/55 max-w-[68ch]">
        What the newsletter drafts from. Paste a link, an article or a raw note, and say what you
        think about it. The same link twice is one entry, so paste again to add a take you did not
        write the first time.
      </p>

      {err && (
        <p className="mt-4 text-[12px] text-[#e0794f] border border-[#e0794f]/30 bg-[#e0794f]/10 rounded-lg px-3 py-2">
          {err}
        </p>
      )}
      {notice && (
        <p className="mt-4 text-[12px] text-white/70 border border-white/15 bg-white/5 rounded-lg px-3 py-2">
          {notice}
        </p>
      )}

      <form onSubmit={drop} className="mt-6 border border-white/10 rounded-xl p-5 bg-[#161616]">
        <p className={labelClass}>Drop something in</p>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className={labelClass}>Where it came from</span>
            <input
              value={source}
              onChange={(e) => setSource(e.target.value)}
              placeholder="Arc House"
              maxLength={80}
              className={inputClass}
            />
          </label>
          <label className="block">
            <span className={labelClass}>Published on</span>
            <input
              type="date"
              value={publishedOn}
              onChange={(e) => setPublishedOn(e.target.value)}
              className={inputClass}
            />
          </label>
        </div>

        <label className="mt-3 block">
          <span className={labelClass}>Title</span>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Arc adds native USDC settlement"
            maxLength={200}
            className={inputClass}
          />
        </label>

        <label className="mt-3 block">
          <span className={labelClass}>Link</span>
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://"
            maxLength={2000}
            className={inputClass}
          />
          <span className="mt-1 block text-[11px] text-white/35">
            Optional. Without one this cannot be told apart from another note, so pasting twice
            makes two entries.
          </span>
        </label>

        {/* The take sits in its own block, ahead of the excerpt. It is the field
            that makes an issue worth reading, and burying it under a paste box
            is how it ends up empty. */}
        <div className="mt-4 border border-[#AFC95B]/30 bg-[#AFC95B]/[0.06] rounded-xl p-4">
          <span className="mono text-[10px] uppercase tracking-[0.14em] font-bold text-[#AFC95B]">
            Your take
          </span>
          <textarea
            value={myTake}
            onChange={(e) => setMyTake(e.target.value)}
            rows={3}
            maxLength={4000}
            placeholder="Why this matters to a supplier waiting ninety days."
            className="mt-2 w-full bg-[#0e0e0e] border border-white/15 rounded-lg px-3 py-2.5 text-[14px] focus:border-white/40 outline-none resize-y"
          />
          <span className="mt-1 block text-[11px] text-white/40">
            The draft is built around this. Without it the entry is a bookmark.
          </span>
        </div>

        <label className="mt-3 block">
          <span className={labelClass}>Summary</span>
          <textarea
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            rows={2}
            maxLength={1000}
            placeholder="One line on what happened."
            className="mt-1.5 w-full bg-[#0e0e0e] border border-white/15 rounded-lg px-3 py-2.5 text-[14px] focus:border-white/40 outline-none resize-y"
          />
        </label>

        <label className="mt-3 block">
          <span className={labelClass}>Excerpt</span>
          <textarea
            value={rawExcerpt}
            onChange={(e) => setRawExcerpt(e.target.value)}
            rows={4}
            placeholder="Paste the part you want to draft from."
            className="mt-1.5 w-full bg-[#0e0e0e] border border-white/15 rounded-lg px-3 py-2.5 text-[13px] focus:border-white/40 outline-none resize-y"
          />
          <span className="mt-1 block text-[11px] text-white/35">
            {rawExcerpt.length > excerptMax
              ? `We keep the first ${excerptMax} characters. The rest is dropped.`
              : `${rawExcerpt.length} of ${excerptMax} characters kept. We hold an excerpt and cite the link, never the article.`}
          </span>
        </label>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className={labelClass}>Tags</span>
            <input
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="arc, settlement"
              className={inputClass}
            />
          </label>
          <div>
            <span className={labelClass}>Importance</span>
            <div className="mt-1.5 flex gap-2">
              {IMPORTANCE.map((i) => (
                <button
                  key={i.value}
                  type="button"
                  onClick={() => setImportance(i.value)}
                  className={`mono text-[10px] uppercase tracking-[0.12em] px-3 py-2.5 rounded-lg border transition ${
                    importance === i.value
                      ? 'bg-white text-[#0e0e0e] border-white font-bold'
                      : 'border-white/15 text-white/55 hover:text-white'
                  }`}
                >
                  {i.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <button
          type="submit"
          disabled={saving || !source.trim() || !title.trim()}
          className="mt-5 mono text-[10px] uppercase tracking-[0.12em] font-bold px-4 py-2.5 rounded-lg bg-white text-[#0e0e0e] disabled:opacity-40"
        >
          {saving ? 'Saving' : 'Add to pipeline'}
        </button>
      </form>

      <div className="mt-8 flex items-center gap-2 flex-wrap">
        {(['all', 'manual', 'arc', 'circle', 'karwan'] as const).map((o) => (
          <button
            key={o}
            type="button"
            onClick={() => setFilter(o)}
            className={`mono text-[10px] uppercase tracking-[0.12em] px-3 py-1.5 rounded-lg border transition ${
              filter === o
                ? 'bg-white text-[#0e0e0e] border-white font-bold'
                : 'border-white/15 text-white/50 hover:text-white'
            }`}
          >
            {o === 'all' ? 'All' : ORIGIN_LABEL[o]}
          </button>
        ))}
        {withoutTake > 0 && (
          <span className="text-[11px] text-white/35">{withoutTake} with no take yet</span>
        )}
      </div>

      <div className="mt-4 space-y-3">
        {signals === null && <p className="text-[13px] text-white/40">Loading</p>}
        {signals !== null && shown.length === 0 && (
          <p className="text-[13px] text-white/40">
            Nothing here yet. Paste something above and it becomes the next issue.
          </p>
        )}

        {shown.map((s) => (
          <article key={s.id} className="border border-white/10 rounded-xl p-4 bg-[#161616]">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="mono text-[9px] uppercase tracking-[0.14em] px-2 py-1 rounded border border-white/15 text-white/50">
                    {ORIGIN_LABEL[s.origin]}
                  </span>
                  <span className="mono text-[10px] uppercase tracking-[0.12em] text-white/35">
                    {s.source}
                  </span>
                  {s.importance === 'high' && (
                    <span className="mono text-[9px] uppercase tracking-[0.14em] px-2 py-1 rounded bg-[#AFC95B]/15 text-[#AFC95B]">
                      High
                    </span>
                  )}
                </div>
                <h2 className="mt-2 font-sans text-[15px] font-bold break-words">
                  {s.url ? (
                    <a
                      href={s.url}
                      target="_blank"
                      rel="noreferrer"
                      className="hover:text-[#AFC95B] transition"
                    >
                      {s.title}
                    </a>
                  ) : (
                    s.title
                  )}
                </h2>
                {s.summary && <p className="mt-1.5 text-[13px] text-white/55">{s.summary}</p>}
                {s.myTake ? (
                  <p className="mt-2.5 text-[13px] text-white/80 border-l-2 border-[#AFC95B] pl-3">
                    {s.myTake}
                  </p>
                ) : (
                  <p className="mt-2.5 text-[12px] text-white/30">
                    No take yet. Paste the link again to add one.
                  </p>
                )}
                {s.tags.length > 0 && (
                  <p className="mt-2 mono text-[10px] text-white/30">{s.tags.join(' · ')}</p>
                )}
              </div>

              <div className="shrink-0 text-right">
                <p className="mono text-[10px] text-white/30">{when(s.publishedAt)}</p>
                <button
                  type="button"
                  onClick={() => dismiss(s)}
                  className="mt-2 mono text-[10px] uppercase tracking-[0.12em] text-white/35 hover:text-[#e0794f] transition"
                >
                  Dismiss
                </button>
              </div>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
