'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '@/shared/hooks/useAuth';
import { api, type ChainEvent } from '@/core/api';
import { sfx } from '@/shared/utils/sfx';
import { subscribeLiveEvents } from '@/shared/utils/liveEventBus';

export interface AppNotification {
  id: string;
  jobId: string;
  type: string;
  summary: string;
  ts: number;
  read: boolean;
  /// Where the user should land when they click. Managed-flow events route to
  /// /jobs/[id] (live job page with MatchBanner); direct-flow events route to
  /// /deals/[id].
  href: string;
  /// True for events that warrant a toast popup in addition to the bell entry.
  /// Reserved for the highest-signal ones. a buyer match landing, a cancel
  /// proposal arriving, an expired brief. The rest live quietly in the bell.
  toast?: boolean;
}

const STORAGE_PREFIX = 'karwan:notifications:';
const MAX_STORED = 30;

// Events worth bubbling into the bell. Split into agent-deal (route to
// /jobs/[id]) and direct-deal (route to /deals/[id]). same data model after
// match approval, but the URL differs before that.
const MANAGED_TYPES = new Set([
  'deal.matched',
  'deal.match.approved',
  'deal.match.declined',
  'job.expired',
  'listing.matched',
  'agent.declined',
]);

const DIRECT_TYPES = new Set([
  'deal.direct.created',
  'deal.accepted',
  'deal.delivered',
  'deal.fund.insufficient',
  'escrow.milestone.released',
  'deal.review.started',
  'deal.review.heartbeat',
  'deal.auto_released',
  'escrow.settled',
  'deal.disputed',
  'deal.cancelled',
  'deal.cancel.proposed',
  'deal.cancel.declined',
]);

const NOTIFY_TYPES = new Set([...MANAGED_TYPES, ...DIRECT_TYPES]);

// High-signal events that should also trigger a toast.
const TOAST_TYPES = new Set([
  'deal.matched',
  'deal.match.approved',
  'deal.cancel.proposed',
  'deal.fund.insufficient',
  'job.expired',
]);

function hrefForType(type: string, jobId: string): string {
  return MANAGED_TYPES.has(type) ? `/jobs/${jobId}` : `/deals/${jobId}`;
}

function summaryFor(type: string, payload: Record<string, unknown> | undefined): string {
  const priceUsdc = (payload?.agreedPriceUsdc as string | undefined) ?? '';
  const askingPriceUsdc =
    (payload?.askingPriceUsdc as string | number | undefined) ?? '';
  const dealAmount = (payload?.dealAmountUsdc as string | undefined) ?? '';
  const reason = (payload?.reason as string | undefined) ?? '';
  switch (type) {
    case 'deal.matched':
      return priceUsdc
        ? `Your agent found a match at ${priceUsdc} USDC. Tap to review.`
        : 'Your agent found a match. Tap to review.';
    case 'deal.match.approved':
      return priceUsdc
        ? `Match accepted at ${priceUsdc} USDC. Escrow funded.`
        : 'Match accepted. Escrow funded.';
    case 'deal.match.declined':
      return 'Match declined. Post a fresh brief to retry.';
    case 'job.expired':
      return 'A brief expired with no match. Repost to retry.';
    case 'listing.matched':
      return askingPriceUsdc
        ? `Karwan matched your listing to a brief at ${askingPriceUsdc} USDC.`
        : 'Karwan matched your listing to an open brief.';
    case 'agent.declined':
      return reason ? `Agent ended negotiation: ${reason}` : 'Agent ended the negotiation.';
    case 'deal.direct.created':
      return dealAmount
        ? `Direct deal opened at ${dealAmount} USDC. Waiting on seller.`
        : 'Direct deal opened. Waiting on seller.';
    case 'deal.accepted':
      return 'Seller accepted. Your agent funded the escrow.';
    case 'deal.delivered':
      return 'Seller marked the work delivered. Release the first milestone.';
    case 'deal.fund.insufficient':
      return 'Buyer agent needs USDC to fund escrow. Top it up from /profile.';
    case 'escrow.milestone.released':
      return 'A milestone was released.';
    case 'deal.review.started':
      return 'Review window opened. Release the final milestone when ready.';
    case 'deal.review.heartbeat':
      return 'Buyer extended the review window.';
    case 'deal.auto_released':
      return 'Review window passed. Final milestone auto-released.';
    case 'escrow.settled':
      return 'Deal settled in full. Reputation recorded on chain.';
    case 'deal.disputed':
      return 'Deal moved to dispute. Resolution is off-platform.';
    case 'deal.cancelled':
      return 'Deal cancelled and refunded.';
    case 'deal.cancel.proposed':
      return reason
        ? `Cancellation proposed: ${reason.slice(0, 60)}`
        : 'Cancellation proposed by your counterparty.';
    case 'deal.cancel.declined':
      return 'Cancellation proposal declined.';
    default:
      return 'Deal update';
  }
}

function storageKey(address?: string | null): string | null {
  return address ? `${STORAGE_PREFIX}${address.toLowerCase()}` : null;
}

function load(address?: string | null): AppNotification[] {
  const key = storageKey(address);
  if (!key || typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as AppNotification[]) : [];
  } catch {
    return [];
  }
}

function save(address: string | null | undefined, list: AppNotification[]) {
  const key = storageKey(address);
  if (!key || typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, JSON.stringify(list.slice(0, MAX_STORED)));
  } catch {
    /* quota, ignore */
  }
}

type ToastListener = (n: AppNotification) => void;
const toastListeners = new Set<ToastListener>();

export function subscribeToToasts(fn: ToastListener) {
  toastListeners.add(fn);
  return () => {
    toastListeners.delete(fn);
  };
}

export function useNotifications() {
  const auth = useAuth();
  const address = auth.address;
  const isConnected = auth.isAuthenticated;
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [hydratedFor, setHydratedFor] = useState<string | null>(null);
  // jobIds the user is a party to, tracked across SSE so we don't miss events
  // where the party-from-payload check would fail (e.g. follow-up events that
  // only carry jobId).
  const jobIdsRef = useRef<Set<string>>(new Set());
  const initialHydrateRef = useRef(false);
  // Tracks notification ids we've already routed to listeners + sound this
  // session. Lets the SSE handler dedupe BEFORE calling setState, so the
  // toast-listener fan-out can happen safely outside any state updater.
  const seenNotificationIdsRef = useRef<Set<string>>(new Set());

  const refreshJobIds = useCallback(() => {
    if (!address) return;
    api
      .directDeals(address)
      .then((res) => {
        jobIdsRef.current = new Set(res.deals.map((d) => d.jobId.toLowerCase()));
      })
      .catch(() => {});
  }, [address]);

  // Backfill historical events on hydrate so notifications that fired while
  // the user was offline (a match landed, a brief expired) still surface in
  // the bell. SSE is live-only; without this, refreshing the tab loses signal.
  const backfill = useCallback(async (me: string) => {
    try {
      const { events } = await api.activity(200);
      const myJobs = new Set<string>();
      const fresh: AppNotification[] = [];
      for (const e of events) {
        if (!NOTIFY_TYPES.has(e.type) || !e.jobId) continue;
        const buyer = (e.payload?.buyer as string | undefined)?.toLowerCase();
        const seller = (e.payload?.seller as string | undefined)?.toLowerCase();
        // For listing.matched, the seller user lives on the listing payload via
        // sellerUser. Cover both keys.
        const sellerUser = (e.payload?.sellerUser as string | undefined)?.toLowerCase();
        if (buyer !== me && seller !== me && sellerUser !== me) continue;
        myJobs.add(e.jobId.toLowerCase());
        fresh.push({
          id: `${e.jobId}-${e.type}-${e.ts}`,
          jobId: e.jobId,
          type: e.type,
          summary: summaryFor(e.type, e.payload),
          ts: e.ts,
          read: false,
          href: hrefForType(e.type, e.jobId),
        });
      }
      for (const j of myJobs) jobIdsRef.current.add(j);
      setNotifications((list) => {
        const seen = new Set(list.map((n) => n.id));
        const merged = [...list];
        for (const n of fresh) if (!seen.has(n.id)) merged.push(n);
        merged.sort((a, b) => b.ts - a.ts);
        return merged.slice(0, MAX_STORED);
      });
      initialHydrateRef.current = true;
    } catch {
      initialHydrateRef.current = true;
    }
  }, []);

  // Hydrate stored notifications + the user's deal jobId set on connect.
  useEffect(() => {
    if (!isConnected || !address) {
      setNotifications([]);
      setHydratedFor(null);
      jobIdsRef.current = new Set();
      initialHydrateRef.current = false;
      seenNotificationIdsRef.current = new Set();
      return;
    }
    initialHydrateRef.current = false;
    const stored = load(address);
    setNotifications(stored);
    // Seed the seen-set with persisted notification ids so the first SSE
    // event after reload doesn't re-fire toasts/sound for items already
    // shown in a previous session.
    seenNotificationIdsRef.current = new Set(stored.map((n) => n.id));
    setHydratedFor(address.toLowerCase());
    refreshJobIds();
    void backfill(address.toLowerCase());
  }, [address, isConnected, refreshJobIds, backfill]);

  // Persist after hydration completes.
  useEffect(() => {
    if (!address || hydratedFor !== address.toLowerCase()) return;
    save(address, notifications);
  }, [address, notifications, hydratedFor]);

  // SSE: turn relevant deal events into notifications + dispatch toasts + sound.
  useEffect(() => {
    if (!isConnected || !address) return;
    const me = address.toLowerCase();

    return subscribeLiveEvents((e) => {
      if (!NOTIFY_TYPES.has(e.type) || !e.jobId) return;

      const buyer = (e.payload?.buyer as string | undefined)?.toLowerCase();
      const seller = (e.payload?.seller as string | undefined)?.toLowerCase();
      const sellerUser = (e.payload?.sellerUser as string | undefined)?.toLowerCase();
      const knownJob = jobIdsRef.current.has(e.jobId.toLowerCase());
      const partyMatch = buyer === me || seller === me || sellerUser === me;
      if (!knownJob && !partyMatch) return;

      if (e.type === 'deal.direct.created' && partyMatch) {
        jobIdsRef.current.add(e.jobId.toLowerCase());
      }
      if (e.type === 'deal.matched' && partyMatch) {
        jobIdsRef.current.add(e.jobId.toLowerCase());
      }

      const id = `${e.jobId}-${e.type}-${e.ts}`;
      const toast = TOAST_TYPES.has(e.type);
      const next: AppNotification = {
        id,
        jobId: e.jobId,
        type: e.type,
        summary: summaryFor(e.type, e.payload),
        ts: e.ts,
        read: false,
        href: hrefForType(e.type, e.jobId),
        toast,
      };

      // Dedupe outside the state updater. Running the toast-listener
      // fan-out inside `setNotifications` triggered React's "Cannot update
      // a component while rendering a different component" warning,
      // because each listener calls setState on its own subscriber and
      // updaters can run during another component's render phase.
      if (seenNotificationIdsRef.current.has(id)) return;
      seenNotificationIdsRef.current.add(id);

      setNotifications((list) => {
        if (list.some((n) => n.id === id)) return list;
        return [next, ...list].slice(0, MAX_STORED);
      });

      if (initialHydrateRef.current) {
        try {
          sfx.send();
        } catch {
          /* ignore */
        }
        if (toast) {
          toastListeners.forEach((fn) => fn(next));
        }
      }
    });
  }, [address, isConnected]);

  const markRead = useCallback((id: string) => {
    setNotifications((list) =>
      list.map((n) => (n.id === id ? { ...n, read: true } : n)),
    );
  }, []);

  const markAllRead = useCallback(() => {
    setNotifications((list) => list.map((n) => ({ ...n, read: true })));
  }, []);

  const clearAll = useCallback(() => setNotifications([]), []);

  const unreadCount = notifications.reduce((n, x) => n + (x.read ? 0 : 1), 0);

  return { notifications, unreadCount, markRead, markAllRead, clearAll };
}
