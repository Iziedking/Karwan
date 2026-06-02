'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  api,
  ApiError,
  getAdminToken,
  setAdminToken,
  type FeedbackItem,
  type FeedbackStatus,
  type FeedbackCategory,
} from '@/core/api';

type Filter = 'all' | FeedbackStatus;

const CATEGORY_COLOR: Record<FeedbackCategory, string> = {
  bug: '#b03d3a',
  improvement: '#2f6f4f',
  praise: '#0a7553',
  other: '#6b6b6b',
};

const STATUS_COLOR: Record<FeedbackStatus, string> = {
  new: 'var(--lp-accent)',
  triaged: '#b25425',
  resolved: '#0a7553',
};

/// Resolves a screenshot URL the backend returned. Absolute (PUBLIC_API_BASE_URL
/// set) is used as-is; a relative path is prefixed with the API origin since the
/// frontend runs on a different host than the backend.
function resolveAssetUrl(url: string): string {
  if (/^https?:\/\//i.test(url)) return url;
  return `${api.baseUrl}${url}`;
}

export default function AdminFeedbackPage() {
  const [items, setItems] = useState<FeedbackItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  // Prompts for the X-Admin-Token if we don't have one yet. Returns false when
  // the operator dismisses the prompt, so callers can stop instead of firing a
  // request that's guaranteed to 401.
  const ensureToken = useCallback((): boolean => {
    if (getAdminToken()) return true;
    const t = window.prompt('Admin token (sent as X-Admin-Token):');
    if (t && t.trim()) {
      setAdminToken(t.trim());
      return true;
    }
    return false;
  }, []);

  const load = useCallback(async () => {
    setError(null);
    if (!ensureToken()) {
      setError('Admin token required. Click "Set token" to enter it.');
      setItems([]);
      return;
    }
    try {
      const res = await api.listFeedback();
      setItems(res.feedback);
    } catch (err) {
      if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
        setAdminToken(null);
        setError('Token rejected. Click "Set token" and re-enter it.');
      } else if (err instanceof ApiError && err.status === 503) {
        setError('Admin gate is not configured on the server (set ADMIN_API_TOKEN).');
      } else {
        setError((err as Error).message);
      }
      setItems([]);
    }
  }, [ensureToken]);

  // Lets the operator overwrite the stored token by hand, then reloads.
  const promptForToken = useCallback(() => {
    const t = window.prompt('Admin token (sent as X-Admin-Token):', getAdminToken() ?? '');
    if (t !== null) {
      setAdminToken(t.trim() || null);
      void load();
    }
  }, [load]);

  useEffect(() => {
    void load();
  }, [load]);

  const counts = useMemo(() => {
    const c = { all: 0, new: 0, triaged: 0, resolved: 0 };
    for (const it of items ?? []) {
      c.all += 1;
      c[it.status] += 1;
    }
    return c;
  }, [items]);

  const visible = useMemo(
    () => (items ?? []).filter((it) => filter === 'all' || it.status === filter),
    [items, filter],
  );

  async function changeStatus(id: string, status: FeedbackStatus) {
    setBusyId(id);
    try {
      await api.setFeedbackStatus(id, status);
      setItems((prev) =>
        (prev ?? []).map((it) => (it.id === id ? { ...it, status } : it)),
      );
    } catch (err) {
      if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
        setAdminToken(null);
        setError('Token rejected. Click "Set token" and re-enter it.');
      } else {
        setError((err as Error).message);
      }
    } finally {
      setBusyId(null);
    }
  }

  return (
    <main className="min-h-screen bg-[var(--lp-light)] text-[var(--lp-dark)]">
      <div className="mx-auto max-w-[1100px] px-[clamp(20px,5vw,48px)] py-[clamp(28px,5vw,56px)]">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="mono text-[10px] uppercase tracking-[0.18em] text-[var(--lp-text-muted)]">
              [:OPERATOR:]
            </p>
            <h1 className="mt-2 font-sans text-[clamp(1.8rem,4vw,2.75rem)] font-extrabold uppercase tracking-[-0.025em] leading-[0.95]">
              Feedback
              <span style={{ color: 'var(--lp-accent)' }}>.</span>
            </h1>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={promptForToken}
              className="mono text-[11px] uppercase tracking-[0.1em] font-semibold px-3.5 py-2 bg-[var(--lp-card)] border border-[var(--lp-border-light)] hover:border-[var(--lp-accent)] transition-colors"
              style={{ borderRadius: 8 }}
            >
              Set token
            </button>
            <button
              type="button"
              onClick={() => void load()}
              className="mono text-[11px] uppercase tracking-[0.1em] font-semibold px-3.5 py-2 bg-[var(--lp-card)] border border-[var(--lp-border-light)] hover:border-[var(--lp-accent)] transition-colors"
              style={{ borderRadius: 8 }}
            >
              Refresh
            </button>
          </div>
        </div>

        {/* FILTERS */}
        <div className="mt-7 flex flex-wrap gap-2">
          {(['all', 'new', 'triaged', 'resolved'] as Filter[]).map((f) => {
            const on = filter === f;
            return (
              <button
                key={f}
                type="button"
                onClick={() => setFilter(f)}
                className="mono text-[11px] uppercase tracking-[0.1em] font-semibold px-3 py-1.5 transition-colors"
                style={{
                  background: on ? 'var(--lp-band-dark)' : 'var(--lp-card)',
                  color: on ? 'var(--lp-accent)' : 'var(--lp-text-sub)',
                  border: `1px solid ${on ? 'var(--lp-band-dark)' : 'var(--lp-border-light)'}`,
                  borderRadius: 999,
                }}
              >
                {f} ({counts[f]})
              </button>
            );
          })}
        </div>

        {error && (
          <p
            className="mt-6 text-[13px] px-3.5 py-2.5"
            style={{
              color: '#b03d3a',
              background: 'rgba(176,61,58,0.08)',
              border: '1px solid rgba(176,61,58,0.30)',
              borderRadius: 8,
            }}
          >
            {error}
          </p>
        )}

        {/* LIST */}
        <div className="mt-7 space-y-4">
          {items === null && (
            <p className="mono text-[12px] uppercase tracking-[0.1em] text-[var(--lp-text-muted)]">
              Loading…
            </p>
          )}
          {items !== null && visible.length === 0 && !error && (
            <p className="text-[14px] text-[var(--lp-text-sub)]">
              No feedback{filter !== 'all' ? ` in "${filter}"` : ' yet'}.
            </p>
          )}
          {visible.map((it) => (
            <FeedbackCard
              key={it.id}
              item={it}
              busy={busyId === it.id}
              onStatus={(s) => void changeStatus(it.id, s)}
              onOpenShot={(url) => setLightbox(url)}
            />
          ))}
        </div>
      </div>

      {lightbox && (
        <button
          type="button"
          aria-label="Close screenshot"
          onClick={() => setLightbox(null)}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={lightbox}
            alt="feedback screenshot"
            className="max-h-[92vh] max-w-[92vw] object-contain"
            style={{ borderRadius: 8 }}
          />
        </button>
      )}
    </main>
  );
}

function FeedbackCard({
  item,
  busy,
  onStatus,
  onOpenShot,
}: {
  item: FeedbackItem;
  busy: boolean;
  onStatus: (s: FeedbackStatus) => void;
  onOpenShot: (url: string) => void;
}) {
  return (
    <div
      className="bg-[var(--lp-card)] border border-[var(--lp-border-light)] p-5"
      style={{
        borderTopLeftRadius: 14,
        borderTopRightRadius: 14,
        borderBottomLeftRadius: 14,
        borderBottomRightRadius: 4,
      }}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span
          className="mono text-[10px] font-bold uppercase tracking-[0.1em] px-2 py-0.5 text-white"
          style={{ background: CATEGORY_COLOR[item.category], borderRadius: 4 }}
        >
          {item.category}
        </span>
        <span
          className="mono text-[10px] font-bold uppercase tracking-[0.1em] px-2 py-0.5"
          style={{
            color: item.status === 'new' ? 'var(--lp-band-dark)' : '#fff',
            background: STATUS_COLOR[item.status],
            borderRadius: 4,
          }}
        >
          {item.status}
        </span>
        <span className="ms-auto mono text-[10px] uppercase tracking-[0.1em] text-[var(--lp-text-muted)]">
          {new Date(item.createdAt).toLocaleString()}
        </span>
      </div>

      <h2 className="mt-3 font-sans text-[17px] font-extrabold tracking-[-0.01em]">
        {item.title}
      </h2>
      <p className="mt-2 text-[14px] leading-relaxed text-[var(--lp-text-sub)] whitespace-pre-wrap break-words">
        {item.message}
      </p>

      {/* META */}
      <div className="mt-3 flex flex-col gap-1">
        {item.context?.url && <Meta k="Where" v={item.context.url} />}
        {item.context?.wallet && <Meta k="Wallet" v={item.context.wallet} mono />}
        {item.contact && <Meta k="Contact" v={item.contact} />}
        {item.context?.userAgent && <Meta k="Client" v={item.context.userAgent} />}
      </div>

      {/* SCREENSHOTS */}
      {item.screenshotUrls.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-3">
          {item.screenshotUrls.map((url) => {
            const resolved = resolveAssetUrl(url);
            return (
              <button
                key={url}
                type="button"
                onClick={() => onOpenShot(resolved)}
                className="overflow-hidden border border-[var(--lp-border-light)] hover:border-[var(--lp-accent)] transition-colors"
                style={{ borderRadius: 8 }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={resolved} alt="screenshot" className="block h-28 w-auto object-cover" />
              </button>
            );
          })}
        </div>
      )}

      {/* ACTIONS */}
      <div className="mt-4 flex flex-wrap gap-2 pt-3 border-t border-[var(--lp-border-light)]">
        {item.status !== 'triaged' && (
          <StatusButton label="Mark triaged" onClick={() => onStatus('triaged')} busy={busy} />
        )}
        {item.status !== 'resolved' && (
          <StatusButton label="Mark resolved" onClick={() => onStatus('resolved')} busy={busy} />
        )}
        {item.status !== 'new' && (
          <StatusButton label="Reopen" onClick={() => onStatus('new')} busy={busy} muted />
        )}
      </div>
    </div>
  );
}

function Meta({ k, v, mono }: { k: string; v: string; mono?: boolean }) {
  return (
    <p className="text-[12px] leading-snug text-[var(--lp-text-muted)] break-words">
      <span className="mono uppercase tracking-[0.1em] text-[10px]">{k}: </span>
      <span className={mono ? 'mono' : undefined} style={{ color: 'var(--lp-text-sub)' }}>
        {v}
      </span>
    </p>
  );
}

function StatusButton({
  label,
  onClick,
  busy,
  muted,
}: {
  label: string;
  onClick: () => void;
  busy: boolean;
  muted?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className="mono text-[11px] uppercase tracking-[0.08em] font-semibold px-3 py-1.5 transition-colors disabled:opacity-50"
      style={{
        background: muted ? 'transparent' : 'var(--lp-light)',
        color: 'var(--lp-dark)',
        border: `1px solid var(--lp-border-light)`,
        borderRadius: 8,
      }}
    >
      {label}
    </button>
  );
}
