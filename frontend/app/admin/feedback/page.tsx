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
import { useTranslations } from '@/shared/i18n/LocaleProvider';
import type { Messages } from '@/shared/i18n/messages/en';

type AdminFeedbackCopy = Messages['adminFeedbackPage'];

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
  const t = useTranslations().adminFeedbackPage;
  const [items, setItems] = useState<FeedbackItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [page, setPage] = useState(0);

  useEffect(() => {
    setPage(0);
  }, [filter]);

  // Prompts for the X-Admin-Token if we don't have one yet. Returns false when
  // the operator dismisses the prompt, so callers can stop instead of firing a
  // request that's guaranteed to 401.
  const ensureToken = useCallback((): boolean => {
    if (getAdminToken()) return true;
    const tok = window.prompt(t.tokenPrompt);
    if (tok && tok.trim()) {
      setAdminToken(tok.trim());
      return true;
    }
    return false;
  }, [t.tokenPrompt]);

  const load = useCallback(async () => {
    setError(null);
    if (!ensureToken()) {
      setError(t.errors.tokenRequired);
      setItems([]);
      return;
    }
    try {
      const res = await api.listFeedback();
      setItems(res.feedback);
    } catch (err) {
      if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
        setAdminToken(null);
        setError(t.errors.tokenRejected);
      } else if (err instanceof ApiError && err.status === 503) {
        setError(t.errors.gateNotConfigured);
      } else {
        setError((err as Error).message);
      }
      setItems([]);
    }
  }, [ensureToken, t.errors.tokenRequired, t.errors.tokenRejected, t.errors.gateNotConfigured]);

  // Lets the operator overwrite the stored token by hand, then reloads.
  const promptForToken = useCallback(() => {
    const tok = window.prompt(t.tokenPrompt, getAdminToken() ?? '');
    if (tok !== null) {
      setAdminToken(tok.trim() || null);
      void load();
    }
  }, [load, t.tokenPrompt]);

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
  const PAGE_SIZE = 25;
  const pageCount = Math.max(1, Math.ceil(visible.length / PAGE_SIZE));
  const paged = visible.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

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
        setError(t.errors.tokenRejected);
      } else {
        setError((err as Error).message);
      }
    } finally {
      setBusyId(null);
    }
  }

  const filterLabels: Record<Filter, string> = {
    all: t.filters.all,
    new: t.filters.new,
    triaged: t.filters.triaged,
    resolved: t.filters.resolved,
  };

  const statusLabels: Record<FeedbackStatus, string> = {
    new: t.statusLabels.new,
    triaged: t.statusLabels.triaged,
    resolved: t.statusLabels.resolved,
  };

  const categoryLabels: Record<FeedbackCategory, string> = {
    bug: t.categoryLabels.bug,
    improvement: t.categoryLabels.improvement,
    praise: t.categoryLabels.praise,
    other: t.categoryLabels.other,
  };

  return (
    <main className="min-h-screen bg-[var(--lp-light)] text-[var(--lp-dark)]">
      <div className="mx-auto max-w-[1100px] px-[clamp(20px,5vw,48px)] py-[clamp(28px,5vw,56px)]">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="mono text-[10px] uppercase tracking-[0.18em] text-[var(--lp-text-muted)]">
              [:{t.eyebrow}:]
            </p>
            <h1 className="mt-2 font-sans text-[clamp(1.8rem,4vw,2.75rem)] font-extrabold uppercase tracking-[-0.025em] leading-[0.95]">
              {t.title}
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
              {t.actions.setToken}
            </button>
            <button
              type="button"
              onClick={() => void load()}
              className="mono text-[11px] uppercase tracking-[0.1em] font-semibold px-3.5 py-2 bg-[var(--lp-card)] border border-[var(--lp-border-light)] hover:border-[var(--lp-accent)] transition-colors"
              style={{ borderRadius: 8 }}
            >
              {t.actions.refresh}
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
                {filterLabels[f]} ({counts[f]})
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
              {t.loading}
            </p>
          )}
          {items !== null && visible.length === 0 && !error && (
            <p className="text-[14px] text-[var(--lp-text-sub)]">
              {filter !== 'all' ? t.emptyInFilter.replace('{filter}', filterLabels[filter]) : t.emptyAll}
            </p>
          )}
          {paged.map((it) => (
            <FeedbackCard
              key={it.id}
              item={it}
              busy={busyId === it.id}
              onStatus={(s) => void changeStatus(it.id, s)}
              onOpenShot={(url) => setLightbox(url)}
              statusLabel={statusLabels[it.status]}
              categoryLabel={categoryLabels[it.category]}
              metaLabels={t.metaLabels}
              actionLabels={t.actions}
            />
          ))}

          {pageCount > 1 && (
            <div className="flex items-center justify-between gap-3 pt-2 mono text-[11px] uppercase tracking-[0.1em] text-[var(--lp-text-muted)]">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0}
                className="hover:text-[var(--lp-dark)] disabled:opacity-30"
              >
                ← prev
              </button>
              <span>
                page {page + 1} / {pageCount}
              </span>
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
                disabled={page >= pageCount - 1}
                className="hover:text-[var(--lp-dark)] disabled:opacity-30"
              >
                next →
              </button>
            </div>
          )}
        </div>
      </div>

      {lightbox && (
        <button
          type="button"
          aria-label={t.lightbox.closeAria}
          onClick={() => setLightbox(null)}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={lightbox}
            alt={t.lightbox.imageAlt}
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
  statusLabel,
  categoryLabel,
  metaLabels,
  actionLabels,
}: {
  item: FeedbackItem;
  busy: boolean;
  onStatus: (s: FeedbackStatus) => void;
  onOpenShot: (url: string) => void;
  statusLabel: string;
  categoryLabel: string;
  metaLabels: AdminFeedbackCopy['metaLabels'];
  actionLabels: AdminFeedbackCopy['actions'];
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
          {categoryLabel}
        </span>
        <span
          className="mono text-[10px] font-bold uppercase tracking-[0.1em] px-2 py-0.5"
          style={{
            color: item.status === 'new' ? 'var(--lp-band-dark)' : '#fff',
            background: STATUS_COLOR[item.status],
            borderRadius: 4,
          }}
        >
          {statusLabel}
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
        {item.context?.url && <Meta k={metaLabels.where} v={item.context.url} />}
        {item.context?.wallet && <Meta k={metaLabels.wallet} v={item.context.wallet} mono />}
        {item.contact && <Meta k={metaLabels.contact} v={item.contact} />}
        {item.context?.userAgent && <Meta k={metaLabels.client} v={item.context.userAgent} />}
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
          <StatusButton label={actionLabels.markTriaged} onClick={() => onStatus('triaged')} busy={busy} />
        )}
        {item.status !== 'resolved' && (
          <StatusButton label={actionLabels.markResolved} onClick={() => onStatus('resolved')} busy={busy} />
        )}
        {item.status !== 'new' && (
          <StatusButton label={actionLabels.reopen} onClick={() => onStatus('new')} busy={busy} muted />
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
