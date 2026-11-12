'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  api,
  ApiError,
  type FeedbackItem,
  type FeedbackStatus,
  type FeedbackCategory,
} from '@/core/api';
import { adminApiUrl } from '@/shared/admin/adminDesk';
import { useTranslations } from '@/shared/i18n/LocaleProvider';
import type { Messages } from '@/shared/i18n/messages/en';

import { reportedListingId } from '@/features/admin/reportedOffer';

type AdminFeedbackCopy = Messages['adminFeedbackPage'];

type Filter = 'all' | FeedbackStatus;

const CATEGORY_COLOR: Record<FeedbackCategory, string> = {
  bug: '#b03d3a',
  improvement: 'var(--lp-accent)',
  praise: 'var(--lp-accent)',
  other: '#6b6b6b',
};

const STATUS_COLOR: Record<FeedbackStatus, string> = {
  new: 'var(--lp-accent)',
  triaged: '#b25425',
  resolved: 'var(--lp-accent)',
};

/// Resolves a screenshot URL the backend returned. Absolute (PUBLIC_API_BASE_URL
/// set) is used as-is; a relative path is prefixed with the API origin since the
/// frontend runs on a different host than the backend.
/// Screenshots are admin only (view 68). An <img> cannot send the desk's
/// session, so each one is fetched through the desk's proxy with it and shown
/// from a local object URL.
function useDeskImage(path: string): string | null {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    let objectUrl: string | null = null;
    // The desk's own cookie carries the sign-in (view 79).
    fetch(adminApiUrl(path.replace(/^https?:\/\/[^/]+/i, '')), { cache: 'no-store', credentials: 'same-origin' })
      .then((r) => (r.ok ? r.blob() : null))
      .then((blob) => {
        if (!blob || !live) return;
        objectUrl = URL.createObjectURL(blob);
        setSrc(objectUrl);
      })
      .catch(() => undefined);
    return () => {
      live = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [path]);
  return src;
}

function Screenshot({ path, onOpen }: { path: string; onOpen: (src: string) => void }) {
  const src = useDeskImage(path);
  return (
    <button
      type="button"
      disabled={!src}
      onClick={() => src && onOpen(src)}
      className="h-28 min-w-28 overflow-hidden border border-[var(--d-line)] hover:border-[var(--lp-accent)] transition-colors"
      style={{ borderRadius: 8 }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {src ? <img src={src} alt="screenshot" className="block h-28 w-auto object-cover" /> : null}
    </button>
  );
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

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await api.listFeedback();
      setItems(res.feedback);
    } catch (err) {
      if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
        setError(t.errors.tokenRejected);
      } else if (err instanceof ApiError && err.status === 503) {
        setError(t.errors.gateNotConfigured);
      } else {
        setError((err as Error).message);
      }
      setItems([]);
    }
  }, [t.errors.tokenRejected, t.errors.gateNotConfigured]);

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

  /// Takes the reported offer off the market. True when it is gone.
  async function removeOffer(listingId: string): Promise<boolean> {
    try {
      await api.removeListingByTeam(listingId);
      return true;
    } catch (err) {
      if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
        setError(t.errors.tokenRejected);
      } else {
        setError((err as Error).message);
      }
      return false;
    }
  }

  async function changeStatus(id: string, status: FeedbackStatus) {
    setBusyId(id);
    try {
      await api.setFeedbackStatus(id, status);
      setItems((prev) =>
        (prev ?? []).map((it) => (it.id === id ? { ...it, status } : it)),
      );
    } catch (err) {
      if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
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
            <p className="text-[10px] text-[var(--d-text-3)]">
              {t.eyebrow}
            </p>
            <h1 className="mt-2 font-sans text-[clamp(1.8rem,4vw,2.75rem)] font-semibold tracking-[-0.025em] leading-[0.95]">
              {t.title}
              <span style={{ color: 'var(--lp-accent)' }}>.</span>
            </h1>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => void load()}
              className="text-[11px] font-semibold px-3.5 py-2 bg-[var(--lp-card)] border border-[var(--d-line)] hover:border-[var(--lp-accent)] transition-colors"
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
                className="text-[11px] font-semibold px-3 py-1.5 transition-colors"
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
            <p className="text-[12px] text-[var(--d-text-3)]">
              {t.loading}
            </p>
          )}
          {items !== null && visible.length === 0 && !error && (
            <p className="text-[14px] text-[var(--d-text-2)]">
              {filter !== 'all' ? t.emptyInFilter.replace('{filter}', filterLabels[filter]) : t.emptyAll}
            </p>
          )}
          {paged.map((it) => (
            <FeedbackCard
              key={it.id}
              item={it}
              busy={busyId === it.id}
              onStatus={(s) => void changeStatus(it.id, s)}
              onRemoveOffer={removeOffer}
              onOpenShot={(url) => setLightbox(url)}
              statusLabel={statusLabels[it.status]}
              categoryLabel={categoryLabels[it.category]}
              metaLabels={t.metaLabels}
              actionLabels={t.actions}
            />
          ))}

          {pageCount > 1 && (
            <div className="flex items-center justify-between gap-3 pt-2 text-[11px] text-[var(--d-text-3)]">
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
          className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-[var(--d-bg)]"
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
  onRemoveOffer,
  onOpenShot,
  statusLabel,
  categoryLabel,
  metaLabels,
  actionLabels,
}: {
  item: FeedbackItem;
  busy: boolean;
  onStatus: (s: FeedbackStatus) => void;
  onRemoveOffer: (listingId: string) => Promise<boolean>;
  onOpenShot: (url: string) => void;
  statusLabel: string;
  categoryLabel: string;
  metaLabels: AdminFeedbackCopy['metaLabels'];
  actionLabels: AdminFeedbackCopy['actions'];
}) {
  // A reported offer can be taken off the market from its report. The first
  // press asks, the second removes.
  const listingId = reportedListingId(item.context?.url);
  const [removal, setRemoval] = useState<'idle' | 'asking' | 'working' | 'done'>('idle');
  const pressRemove = async () => {
    if (!listingId) return;
    if (removal === 'idle') return setRemoval('asking');
    setRemoval('working');
    setRemoval((await onRemoveOffer(listingId)) ? 'done' : 'idle');
  };
  return (
    <div
      className="bg-[var(--lp-card)] border border-[var(--d-line)] p-5"
      style={{
        borderRadius: 14,
      }}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span
          className="text-[10px] font-bold px-2 py-0.5 text-[var(--d-text)]"
          style={{ background: CATEGORY_COLOR[item.category], borderRadius: 4 }}
        >
          {categoryLabel}
        </span>
        <span
          className="text-[10px] font-bold px-2 py-0.5"
          style={{
            color: item.status === 'new' ? 'var(--lp-band-dark)' : '#fff',
            background: STATUS_COLOR[item.status],
            borderRadius: 4,
          }}
        >
          {statusLabel}
        </span>
        <span className="ms-auto text-[10px] text-[var(--d-text-3)]">
          {new Date(item.createdAt).toLocaleString()}
        </span>
      </div>

      <h2 className="mt-3 font-sans text-[17px] font-semibold tracking-[-0.01em]">
        {item.title}
      </h2>
      <p className="mt-2 text-[14px] leading-relaxed text-[var(--d-text-2)] whitespace-pre-wrap break-words">
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
          {item.screenshotUrls.map((url) => (
            <Screenshot key={url} path={url} onOpen={onOpenShot} />
          ))}
        </div>
      )}

      {/* ACTIONS */}
      <div className="mt-4 flex flex-wrap gap-2 pt-3 border-t border-[var(--d-line)]">
        {item.status !== 'triaged' && (
          <StatusButton label={actionLabels.markTriaged} onClick={() => onStatus('triaged')} busy={busy} />
        )}
        {item.status !== 'resolved' && (
          <StatusButton label={actionLabels.markResolved} onClick={() => onStatus('resolved')} busy={busy} />
        )}
        {item.status !== 'new' && (
          <StatusButton label={actionLabels.reopen} onClick={() => onStatus('new')} busy={busy} muted />
        )}
        {listingId && removal !== 'done' && (
          <StatusButton
            label={removal === 'idle' ? actionLabels.removeOffer : actionLabels.confirmRemoveOffer}
            onClick={() => void pressRemove()}
            busy={busy || removal === 'working'}
          />
        )}
        {removal === 'done' && (
          <span role="status" className="self-center text-[11px] text-[var(--d-text-2)]">{actionLabels.offerRemoved}</span>
        )}
      </div>
    </div>
  );
}

function Meta({ k, v, mono }: { k: string; v: string; mono?: boolean }) {
  return (
    <p className="text-[12px] leading-snug text-[var(--d-text-3)] break-words">
      <span className="text-[10px]">{k}: </span>
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
      className="text-[11px] font-semibold px-3 py-1.5 transition-colors disabled:opacity-50"
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
