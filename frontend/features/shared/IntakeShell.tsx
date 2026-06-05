'use client';
import { useEffect, useState, type ReactNode } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { api } from '@/core/api';

/// Shared shell for the three intake composers (Direct Deal, Brief, Listing).
/// Renders the mode chooser at top + either a free-text intake (textarea +
/// Extract) or the structured form. After a successful extraction, the
/// shell sets the URL params named by `mapToParams` and forces a remount
/// of the form via `key` so its useState(initial...) reads the fresh
/// values. Choice persists per browser via localStorage.

type Mode = 'text' | 'form';

export type ExtractedDeal = {
  amountUsdc: number | null;
  deadlineDays: number | null;
  terms: string;
  title: string | null;
  tolerancePct: number | null;
  suggestedFirstMilestonePct: number | null;
  suggestedTrustedMatch: boolean | null;
  counterpartyHint: string | null;
  confidence: { amount: number; deadline: number; terms: number };
  notes: string[];
};

export interface IntakeShellProps {
  surface: 'direct' | 'brief' | 'listing';
  /// localStorage key under which the user's preferred mode persists. Use a
  /// distinct key per surface so a buyer's Brief preference doesn't override
  /// their Direct Deal preference.
  storageKey: string;
  /// Placeholder shown in the textarea. Surface-specific.
  placeholder: string;
  /// One-liner hint under the chooser.
  helper: string;
  /// Build the URLSearchParams that drive the form prefill. Receives the
  /// extracted object; returns the params to merge into the URL.
  mapToParams: (e: ExtractedDeal, current: URLSearchParams) => URLSearchParams;
  /// Build the notes panel content. Receives the extracted object; returns
  /// any human-readable lines to surface above the form (extracted fields
  /// that didn't fit the URL prefill, model uncertainty, etc.).
  notesFor: (e: ExtractedDeal) => string[];
  /// The structured form rendered when mode is 'form'. The shell bumps `key`
  /// after every successful extraction to force the form to remount and
  /// re-read URL params as its initial state.
  renderForm: (formKey: number) => ReactNode;
}

export function IntakeShell({
  surface,
  storageKey,
  placeholder,
  helper,
  mapToParams,
  notesFor,
  renderForm,
}: IntakeShellProps) {
  const router = useRouter();
  const search = useSearchParams();

  const [mode, setMode] = useState<Mode>('form');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notes, setNotes] = useState<string[]>([]);
  const [formKey, setFormKey] = useState(0);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(storageKey) as Mode | null;
      if (saved === 'text' || saved === 'form') setMode(saved);
    } catch {
      // ignore (private windows etc.)
    }
  }, [storageKey]);

  const pickMode = (next: Mode) => {
    setMode(next);
    try {
      localStorage.setItem(storageKey, next);
    } catch {
      // ignore
    }
  };

  const submit = async () => {
    const trimmed = text.trim();
    if (trimmed.length < 8) {
      setError('Add a bit more detail. A sentence or two is enough.');
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const res = await api.extractDeal({ text: trimmed, surface });
      const extracted = res.extracted as ExtractedDeal;
      const next = mapToParams(extracted, new URLSearchParams(search.toString()));
      router.replace(`?${next.toString()}`, { scroll: false });
      setNotes(notesFor(extracted).slice(0, 8));
      setFormKey((k) => k + 1);
      pickMode('form');
    } catch (err) {
      setError(
        (err as Error).message ??
          'Could not parse that description. You can fill the form instead.',
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-7">
      <div className="inline-flex p-1 gap-1" style={CHOOSER_BG}>
        <ChooserButton active={mode === 'text'} onClick={() => pickMode('text')}>
          Type it out
        </ChooserButton>
        <ChooserButton active={mode === 'form'} onClick={() => pickMode('form')}>
          Fill the form
        </ChooserButton>
      </div>

      {mode === 'text' ? (
        <div className="space-y-4">
          <p className="text-[14px] leading-relaxed text-[var(--lp-text-sub)] max-w-[52ch]">
            {helper}
          </p>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={placeholder}
            rows={6}
            maxLength={4000}
            className="w-full px-4 py-3 text-[14px] leading-relaxed bg-[var(--lp-card)] text-[var(--lp-dark)] border border-[var(--lp-border-light)] focus:border-[var(--lp-accent)] focus:outline-none transition-[border-color] duration-150"
            style={{
              borderTopLeftRadius: 14,
              borderTopRightRadius: 14,
              borderBottomLeftRadius: 14,
              borderBottomRightRadius: 3,
              resize: 'vertical',
            }}
          />
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <span className="mono text-[10px] uppercase tracking-[0.14em] text-[var(--lp-text-muted)]">
              {text.trim().length}/4000
            </span>
            <button
              type="button"
              onClick={submit}
              disabled={busy || text.trim().length < 8}
              className="px-5 py-2.5 mono text-[11px] font-bold uppercase tracking-[0.1em] transition disabled:opacity-35 disabled:cursor-not-allowed"
              style={{
                background: busy ? 'var(--lp-card)' : 'var(--lp-dark)',
                color: 'var(--lp-accent)',
                borderTopLeftRadius: 10,
                borderTopRightRadius: 10,
                borderBottomLeftRadius: 10,
                borderBottomRightRadius: 3,
              }}
            >
              {busy ? 'Extracting' : 'Extract fields →'}
            </button>
          </div>
          {error ? (
            <p
              className="text-[13px] px-4 py-3"
              style={{
                background: 'rgba(178, 84, 37, 0.10)',
                color: '#b25425',
                border: '1px solid rgba(178, 84, 37, 0.35)',
                borderTopLeftRadius: 10,
                borderTopRightRadius: 10,
                borderBottomLeftRadius: 10,
                borderBottomRightRadius: 3,
              }}
            >
              {error}
            </p>
          ) : null}
        </div>
      ) : (
        <>
          {notes.length > 0 ? (
            <div
              className="px-5 py-4"
              style={{
                background: 'color-mix(in oklab, var(--lp-accent) 8%, transparent)',
                border: '1px solid color-mix(in oklab, var(--lp-accent) 30%, transparent)',
                borderTopLeftRadius: 14,
                borderTopRightRadius: 14,
                borderBottomLeftRadius: 14,
                borderBottomRightRadius: 3,
              }}
            >
              <p className="mono text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--lp-band-dark)]">
                [:NOTES FROM EXTRACTION:]
              </p>
              <ul className="mt-2 space-y-1.5 text-[13px] leading-snug text-[var(--lp-dark)]">
                {notes.map((n, i) => (
                  <li key={i} className="flex gap-2">
                    <span aria-hidden className="text-[var(--lp-accent)]">·</span>
                    <span>{n}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {renderForm(formKey)}
        </>
      )}
    </div>
  );
}

const CHOOSER_BG = {
  background: 'var(--lp-light)',
  border: '1px solid var(--lp-border-light)',
  borderTopLeftRadius: 12,
  borderTopRightRadius: 12,
  borderBottomLeftRadius: 12,
  borderBottomRightRadius: 3,
} as const;

const CHOOSER_RADII = {
  borderTopLeftRadius: 9,
  borderTopRightRadius: 9,
  borderBottomLeftRadius: 9,
  borderBottomRightRadius: 2,
} as const;

function ChooserButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="px-4 py-2 mono text-[11px] font-semibold uppercase tracking-[0.1em] transition-[background-color,color,box-shadow] duration-200"
      style={{
        background: active ? 'var(--lp-dark)' : 'transparent',
        color: active ? 'var(--lp-accent)' : 'var(--lp-text-sub)',
        boxShadow: active ? '0 2px 0 rgba(0,0,0,0.18)' : 'none',
        ...CHOOSER_RADII,
      }}
    >
      {children}
    </button>
  );
}
