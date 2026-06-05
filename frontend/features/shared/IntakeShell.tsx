'use client';
import { useEffect, useState, type ReactNode } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { api } from '@/core/api';

/// Shared shell for the three intake composers (Direct Deal, Brief, Listing).
/// Two modes, with a tooltip on each so the chooser is self-explanatory:
///   - "Type it out" (default, more user-friendly): textarea + Extract. The
///     shell calls the parent's `directPost(extracted)` and on success the
///     parent navigates. If the post can't run yet because the LLM left
///     required fields blank, the shell falls back to "Fill the form" mode
///     with the extracted values pre-filled (via URL params + a key bump on
///     the form). The user can edit and submit normally.
///   - "Fill the form": the existing structured form, no LLM in the path.
///
/// Default mode is 'text' (the user explicitly asked for this) and the
/// choice persists per surface in localStorage so a repeat user lands on
/// whichever mode they last used.

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

/// Result the parent's directPost returns. Discriminated by `kind`:
///   - 'posted' → parent already navigated, shell does nothing more
///   - 'review' → shell switches to form mode with params merged into URL,
///     key bumped, notes shown above the form
///   - 'error'  → shell shows an inline error, stays on text mode
export type DirectPostResult =
  | { kind: 'posted' }
  | { kind: 'review'; params: URLSearchParams; notes: string[] }
  | { kind: 'error'; error: string };

export interface IntakeShellProps {
  surface: 'direct' | 'brief' | 'listing';
  storageKey: string;
  placeholder: string;
  helper: string;
  /// Hover/long-press tooltip for the "Type it out" chooser pill.
  textTooltip: string;
  /// Hover/long-press tooltip for the "Fill the form" chooser pill.
  formTooltip: string;
  /// Called when the user clicks Extract. The parent decides what to do
  /// with the extracted data — usually post the entity and navigate. If
  /// posting can't happen yet, return { needsReview: true, params, notes }
  /// to fall back to form mode with prefilled values for editing.
  directPost: (e: ExtractedDeal) => Promise<DirectPostResult>;
  renderForm: (formKey: number) => ReactNode;
}

export function IntakeShell({
  surface,
  storageKey,
  placeholder,
  helper,
  textTooltip,
  formTooltip,
  directPost,
  renderForm,
}: IntakeShellProps) {
  const router = useRouter();
  const search = useSearchParams();

  const [mode, setMode] = useState<Mode>('text');
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
      const outcome = await directPost(extracted);

      if (outcome.kind === 'posted') {
        // Parent navigated. Nothing more to do.
        return;
      }
      if (outcome.kind === 'review') {
        router.replace(`?${outcome.params.toString()}`, { scroll: false });
        setNotes(outcome.notes.slice(0, 8));
        setFormKey((k) => k + 1);
        pickMode('form');
        return;
      }
      setError(outcome.error);
    } catch (err) {
      setError(
        (err as Error).message ??
          'Could not parse that description. Try the form instead.',
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-7">
      <div className="inline-flex p-1 gap-1" style={CHOOSER_BG}>
        <ChooserButton
          active={mode === 'text'}
          onClick={() => pickMode('text')}
          tooltip={textTooltip}
        >
          Type it out
        </ChooserButton>
        <ChooserButton
          active={mode === 'form'}
          onClick={() => pickMode('form')}
          tooltip={formTooltip}
        >
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
              {busy ? 'Posting' : 'Post →'}
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
                [:NEEDS YOUR INPUT:]
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
  tooltip,
  children,
}: {
  active: boolean;
  onClick: () => void;
  tooltip: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={tooltip}
      aria-label={tooltip}
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
