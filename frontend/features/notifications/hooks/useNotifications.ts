'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useAccount } from 'wagmi';
import { api, type ChainEvent } from '@/core/api';

export interface AppNotification {
  id: string;
  jobId: string;
  type: string;
  summary: string;
  ts: number;
  read: boolean;
}

const STORAGE_PREFIX = 'karwan:notifications:';
const MAX_STORED = 30;

// Direct-deal lifecycle events worth surfacing in the bell.
const NOTIFY_TYPES = new Set([
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
]);

function summaryFor(type: string): string {
  switch (type) {
    case 'deal.direct.created':
      return 'Direct deal opened and funded';
    case 'deal.accepted':
      return 'Seller accepted the deal terms';
    case 'deal.delivered':
      return 'Seller marked the work delivered';
    case 'deal.fund.insufficient':
      return 'Buyer agent needs USDC to fund escrow';
    case 'escrow.milestone.released':
      return 'A milestone was released';
    case 'deal.review.started':
      return 'Buyer review window opened';
    case 'deal.review.heartbeat':
      return 'Buyer is still reviewing';
    case 'deal.auto_released':
      return 'Final milestone auto-released';
    case 'escrow.settled':
      return 'Deal settled in full';
    case 'deal.disputed':
      return 'Deal moved to dispute';
    case 'deal.cancelled':
      return 'Deal cancelled and refunded';
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

export function useNotifications() {
  const { address, isConnected } = useAccount();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [hydratedFor, setHydratedFor] = useState<string | null>(null);
  // jobIds of direct deals belonging to the connected wallet.
  const jobIdsRef = useRef<Set<string>>(new Set());

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
  // the user was offline (e.g. a buyer creating a direct deal naming them as
  // seller) still surface in the bell. SSE is live-only, so without this the
  // seller never sees the deal until the buyer triggers a new event.
  const backfill = useCallback(async (me: string) => {
    try {
      const { events } = await api.activity(200);
      const myJobs = new Set<string>();
      const fresh: AppNotification[] = [];
      for (const e of events) {
        if (!NOTIFY_TYPES.has(e.type) || !e.jobId) continue;
        const buyer = (e.payload?.buyer as string | undefined)?.toLowerCase();
        const seller = (e.payload?.seller as string | undefined)?.toLowerCase();
        if (buyer !== me && seller !== me) continue;
        myJobs.add(e.jobId.toLowerCase());
        fresh.push({
          id: `${e.jobId}-${e.type}-${e.ts}`,
          jobId: e.jobId,
          type: e.type,
          summary: summaryFor(e.type),
          ts: e.ts,
          read: false,
        });
      }
      for (const j of myJobs) jobIdsRef.current.add(j);
      setNotifications((list) => {
        const seen = new Set(list.map((n) => n.id));
        const merged = [...list];
        // Preserve the `read` state for entries we've already stored.
        for (const n of fresh) if (!seen.has(n.id)) merged.push(n);
        merged.sort((a, b) => b.ts - a.ts);
        return merged.slice(0, MAX_STORED);
      });
    } catch {
      /* ignore — the live SSE will still pick up new events */
    }
  }, []);

  // Hydrate stored notifications + the user's deal jobId set on connect.
  useEffect(() => {
    if (!isConnected || !address) {
      setNotifications([]);
      setHydratedFor(null);
      jobIdsRef.current = new Set();
      return;
    }
    setNotifications(load(address));
    setHydratedFor(address.toLowerCase());
    refreshJobIds();
    void backfill(address.toLowerCase());
  }, [address, isConnected, refreshJobIds, backfill]);

  // Persist after hydration completes.
  useEffect(() => {
    if (!address || hydratedFor !== address.toLowerCase()) return;
    save(address, notifications);
  }, [address, notifications, hydratedFor]);

  // SSE: turn relevant deal events into notifications.
  useEffect(() => {
    if (!isConnected || !address) return;
    const me = address.toLowerCase();
    const es = new EventSource(api.eventsUrl());

    const onMsg = (raw: MessageEvent) => {
      try {
        const e = JSON.parse(raw.data) as ChainEvent;
        if (!NOTIFY_TYPES.has(e.type) || !e.jobId) return;

        const buyer = (e.payload?.buyer as string | undefined)?.toLowerCase();
        const seller = (e.payload?.seller as string | undefined)?.toLowerCase();
        const knownJob = jobIdsRef.current.has(e.jobId.toLowerCase());
        const partyMatch = buyer === me || seller === me;
        if (!knownJob && !partyMatch) return;

        // A freshly opened deal belongs to this wallet, so start tracking it.
        if (e.type === 'deal.direct.created' && partyMatch) {
          jobIdsRef.current.add(e.jobId.toLowerCase());
        }

        const id = `${e.jobId}-${e.type}-${e.ts}`;
        setNotifications((list) => {
          if (list.some((n) => n.id === id)) return list;
          const next: AppNotification = {
            id,
            jobId: e.jobId!,
            type: e.type,
            summary: summaryFor(e.type),
            ts: e.ts,
            read: false,
          };
          return [next, ...list].slice(0, MAX_STORED);
        });
      } catch {
        /* ignore */
      }
    };

    for (const t of NOTIFY_TYPES) es.addEventListener(t, onMsg);
    return () => {
      for (const t of NOTIFY_TYPES) es.removeEventListener(t, onMsg);
      es.close();
    };
  }, [address, isConnected]);

  const markRead = useCallback((id: string) => {
    setNotifications((list) =>
      list.map((n) => (n.id === id ? { ...n, read: true } : n)),
    );
  }, []);

  const clearAll = useCallback(() => setNotifications([]), []);

  const unreadCount = notifications.reduce((n, x) => n + (x.read ? 0 : 1), 0);

  return { notifications, unreadCount, markRead, clearAll };
}
