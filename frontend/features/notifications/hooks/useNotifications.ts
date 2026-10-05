'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/shared/hooks/useAuth';
import { api, type ChainEvent, type DirectDeal } from '@/core/api';
import { qk } from '@/core/queryKeys';
import { moneySounds } from '@/shared/sound/moneySounds';
import { useTranslations } from '@/shared/i18n/LocaleProvider';
import { summaryFor } from '@/features/notifications/summary';
import { fill } from '@/features/deals/workspace/presentation';
import { bridgeDirection, classifyMoneyEvent, soundKeysFor } from '../classifyMoneyEvent';
import { subscribeLiveEvents } from '@/shared/utils/liveEventBus';
import { safeNotificationHref } from '../notificationRouting';
import {
  NOTIFICATION_STORAGE_PREFIX,
  loadReadIds,
  saveReadIds,
  loadClearedBefore,
  saveClearedBefore,
} from '@/shared/utils/notificationStore';
// Re-export so existing call sites can keep importing from the hook module.
export { purgeStoredNotifications } from '@/shared/utils/notificationStore';
import {
  ACTION_TYPES,
  BRIDGE_TYPES,
  FINANCE_RECIPIENT_KEYS,
  FINANCE_TYPES,
  MANAGED_TYPES,
  MONEY_DIRECT_OWNER_KEY,
  MONEY_DIRECT_TYPES,
  NOTIFY_TYPES,
  RECIPIENT,
  TOAST_TYPES,
  WALLET_TYPES,
  type Role,
} from '../notificationTypes';

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


const STORAGE_PREFIX = NOTIFICATION_STORAGE_PREFIX;
const MAX_STORED = 30;


/// Money that moved opens its receipt in the transaction history. The
/// transaction hash is on both sides of a transfer, so it finds the row for
/// the sender and the recipient alike.
function receiptHref(e: Pick<ChainEvent, 'payload'>): string {
  const key = (e.payload?.txHash as string | undefined) ?? (e.payload?.bridgeId as string | undefined);
  return key ? `/activity?receipt=${encodeURIComponent(key)}` : '/activity';
}

function hrefForType(type: string, jobId: string): string {
  // listing.matched fires when a seller's offer matches a buyer's brief and the
  // agent bids, before any match proposal exists. The buyer's job page is
  // private to the two parties (and to the seller only once a proposal names
  // them), so deep-linking there dead-ends the seller on "this deal is private."
  // Send them to their own dashboard, where the bid and any resulting match
  // surface. Once a proposal exists, deal.matched routes them to /jobs/[id].
  if (type === 'listing.matched') return '/seller';
  // Trend nudge points the seller at the live requests driving the rising demand.
  if (type === 'trend.match') return '/market';
  if (BRIDGE_TYPES.has(type) || WALLET_TYPES.has(type)) return '/activity';
  if (type.startsWith('vault.')) return '/stake';
  if (type.startsWith('agent.')) return '/profile';
  // Tier-up lands on the profile, where the 12h celebrate card renders the
  // full breakdown alongside the user's stake, agents, and identity wallet.
  if (type === 'reputation.tier-up') return '/profile';
  // Action events land on the deal page's action card so the user reaches
  // Mark Delivered / Release / Accept without a second scroll.
  if (ACTION_TYPES.has(type) && jobId) return `/deals/${jobId}#action`;
  if (!jobId) return '/app';
  return MANAGED_TYPES.has(type) ? `/jobs/${jobId}` : `/deals/${jobId}`;
}

/// One sound per notification. Money arriving or leaving gets its own; the
/// rest keep the kit's tone. Dedupe and the hold for a pressed button live in
/// moneySounds.
function playNotificationSound(e: ChainEvent, me: string, role: Role | null) {
  moneySounds.notified(classifyMoneyEvent(e.type, e.payload, { address: me, role }), soundKeysFor(e));
}

function bridgeNotificationId(e: ChainEvent): string {
  const ref = (e.payload?.bridgeId as string | undefined) ?? (e.payload?.txHash as string | undefined) ?? String(e.ts);
  return `${e.type}-${ref}`;
}

function bridgeSummary(e: ChainEvent, copy: { arrivedArc: string; reachedDestination: string }): string {
  const amount = trimUsdcLabel(String(e.payload?.amountUsdc ?? '0'));
  return fill(bridgeDirection(e.payload) === 'in' ? copy.arrivedArc : copy.reachedDestination, { amount });
}

function trimUsdcLabel(raw: string): string {
  if (!raw.includes('.')) return raw;
  const trimmed = raw.replace(/\.?0+$/, '');
  return trimmed.length === 0 ? '0' : trimmed;
}

/// Resolves the viewer's role in this event's deal. Prefers the payload (which
/// carries buyer/seller for the events that start a deal), falls back to the
/// jobId -> role map built from the user's deals. Returns null when we cannot
/// tell, in which case role-specific events are not shown to avoid misdelivery.
function roleForEvent(
  payload: Record<string, unknown> | undefined,
  me: string,
  jobId: string,
  roleMap: Map<string, Role>,
): Role | null {
  const buyer = (payload?.buyer as string | undefined)?.toLowerCase();
  const seller = (payload?.seller as string | undefined)?.toLowerCase();
  const sellerUser = (payload?.sellerUser as string | undefined)?.toLowerCase();
  if (buyer === me) return 'buyer';
  if (seller === me || sellerUser === me) return 'seller';
  return roleMap.get(jobId.toLowerCase()) ?? null;
}

function shouldNotify(
  type: string,
  role: Role | null,
  payload: Record<string, unknown> | undefined,
): boolean {
  // Cancellation lifecycle routes by who proposed it.
  if (type === 'deal.cancel.proposed') {
    const by = payload?.proposedBy as Role | undefined;
    return !!role && !!by && role !== by; // only the counterparty hears the proposal
  }
  // A buyer edit or a seller counter is news only to the other side.
  if (type === 'deal.direct.edited') {
    const by: Role = payload?.countered ? 'seller' : 'buyer';
    return !!role && role !== by;
  }
  if (type === 'deal.cancel.declined') {
    const by = payload?.proposedBy as Role | undefined;
    return !!role && !!by && role === by; // only the proposer hears the decline
  }
  // A near-miss is addressed to exactly one party: the side being asked to
  // stretch beyond their range. Only they should hear it.
  if (type === 'negotiation.near-miss') {
    const askedSide = payload?.askedSide as Role | undefined;
    return !!role && !!askedSide && role === askedSide;
  }
  const rule = RECIPIENT[type];
  if (!rule) return false;
  // 'both' means "either party to THIS deal", never "everyone." Require a
  // resolved role so a 'both' event from a deal the viewer isn't part of (which
  // the global SSE bus and the activity feed both carry) doesn't leak into their
  // bell as a generic notification. role is non-null only when the viewer is a
  // party (named in the payload, or the jobId is in their deal map).
  if (rule === 'both') return role != null;
  return role === rule;
}

/// Which side of a financing event the viewer is on, or null if neither. The
/// seller check comes first: on a deal where one address somehow held both
/// sides, being told "you were repaid" is less useful than "you owe nothing".
function financeRoleFor(
  type: string,
  payload: Record<string, unknown> | undefined,
  me: string,
): Role | null {
  const keys = FINANCE_RECIPIENT_KEYS[type];
  if (!keys) return null;
  for (const k of keys) {
    if ((payload?.[k] as string | undefined)?.toLowerCase() === me) {
      return k === 'seller' ? 'seller' : 'financier';
    }
  }
  return null;
}

function financeHref(jobId: string): string {
  return jobId ? `/deals/${jobId}` : '/financier';
}

/// The payload with the deal's trade type filled in when the event did not
/// carry one. Events replayed from chain logs hold only what the log held, and
/// those are the ones whose wording would otherwise fall back to freelance. The
/// viewer's own deal list already knows what each of their deals is.
function withTradeType(
  payload: Record<string, unknown> | undefined,
  jobId: string,
  tradeByJob: Map<string, string>,
): Record<string, unknown> | undefined {
  if (payload?.tradeType) return payload;
  const known = tradeByJob.get(jobId.toLowerCase());
  if (!known) return payload;
  return { ...(payload ?? {}), tradeType: known };
}

function storageKey(address?: string | null): string | null {
  return address ? `${STORAGE_PREFIX}${address.toLowerCase()}` : null;
}

function load(address?: string | null): AppNotification[] {
  const key = storageKey(address);
  if (!key || typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as AppNotification[];
    return Array.isArray(parsed)
      ? parsed.map((notification) => ({
          ...notification,
          href: safeNotificationHref(notification),
        }))
      : [];
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
  const qc = useQueryClient();
  const translations = useTranslations();
  const notifyCopy = translations.money.notify;
  const bell = translations.bell;
  // Read inside the live-event handler, which subscribes once per account.
  const notifyCopyRef = useRef(notifyCopy);
  notifyCopyRef.current = notifyCopy;
  const address = auth.address;
  const isConnected = auth.isAuthenticated;
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [hydratedFor, setHydratedFor] = useState<string | null>(null);
  // jobIds the user is a party to + their role in each, so events that only
  // carry a jobId still route to the correct side.
  const jobIdsRef = useRef<Set<string>>(new Set());
  const roleByJobRef = useRef<Map<string, Role>>(new Map());
  const tradeByJobRef = useRef<Map<string, string>>(new Map());
  const initialHydrateRef = useRef(false);
  // Tracks notification ids we've already routed to listeners + sound this
  // session. Lets the SSE handler dedupe BEFORE calling setState, so the
  // toast-listener fan-out can happen safely outside any state updater.
  const seenNotificationIdsRef = useRef<Set<string>>(new Set());
  // Mirror of the latest list so read/clear actions can persist synchronously.
  // Clicking a notification both marks it read and navigates to the deal; the
  // passive persist effect can miss that write before the route unmounts, which
  // made read notifications come back unread on the next load.
  const notificationsRef = useRef<AppNotification[]>([]);
  // Read-state that outlives the 30-item bell cache. Backfill and SSE paint a
  // notification read when its id is in here, so a read item that was trimmed
  // from the bell (or whose cache was lost) doesn't reappear unread.
  const readIdsRef = useRef<Set<string>>(new Set());
  // High-water mark set by "clear all". Backfill + SSE drop any event at or
  // below it so cleared notifications stay cleared across reload and re-login,
  // while genuinely newer events still come through.
  const clearedBeforeRef = useRef<number>(0);

  const refreshJobIds = useCallback(async () => {
    if (!address) return;
    const me = address.toLowerCase();
    try {
      /// Read through the shared deal-list query so we don't double-fetch
      /// every connect; useDirectDeals already keeps this fresh and
      /// SSE-invalidated. fetchQuery returns cached data if fresh.
      const deals = await qc.fetchQuery({
        queryKey: qk.deals.list(address),
        queryFn: () => api.directDeals(address).then((r) => r.deals),
      });
      const ids = new Set<string>();
      const roles = new Map<string, Role>();
      const trades = new Map<string, string>();
      for (const d of (deals as DirectDeal[])) {
        const j = d.jobId.toLowerCase();
        ids.add(j);
        roles.set(j, d.buyer.toLowerCase() === me ? 'buyer' : 'seller');
        if (d.tradeType) trades.set(j, d.tradeType);
      }
      jobIdsRef.current = ids;
      roleByJobRef.current = roles;
      tradeByJobRef.current = trades;
    } catch {
      /* keep whatever we have */
    }
  }, [address, qc]);

  // Backfill historical events on hydrate so notifications that fired while
  // the user was offline (a match landed, a brief expired) still surface in
  // the bell. SSE is live-only; without this, refreshing the tab loses signal.
  const backfill = useCallback(async (me: string) => {
    try {
      // Scope to the caller so the BACKEND returns only events this user is a
      // party to. Without the caller arg this hit the global feed, which (with
      // the platform-wide activity stream) leaked other users' deals into the
      // bell. The shouldNotify role check below is the second guard for the
      // live SSE path, which is global by nature.
      const { events } = await api.activity(200, undefined, me);
      const fresh: AppNotification[] = [];
      for (const e of events) {
        if (!NOTIFY_TYPES.has(e.type)) continue;
        if (e.ts <= clearedBeforeRef.current) continue;
        // Wallet events carry no jobId; route by owner directly and skip the
        // deal-role machinery.
        if (WALLET_TYPES.has(e.type)) {
          const owner = (e.payload?.owner as string | undefined)?.toLowerCase();
          if (owner !== me) continue;
          const tx = (e.payload?.txHash as string | undefined) ?? '';
          const wallet = (e.payload?.walletAddress as string | undefined) ?? '';
          const id = `${e.type}-${tx || e.ts}-${wallet}`;
          fresh.push({
            id,
            jobId: '',
            type: e.type,
            summary: summaryFor(e.type, e.payload, null, bell),
            ts: e.ts,
            read: readIdsRef.current.has(id),
            href: receiptHref(e),
          });
          continue;
        }
        // Vault and agent money events carry no jobId either. The owner key
        // varies by event family so look it up before filtering.
        if (MONEY_DIRECT_TYPES.has(e.type)) {
          const key = MONEY_DIRECT_OWNER_KEY[e.type];
          const owner = (e.payload?.[key] as string | undefined)?.toLowerCase();
          if (owner !== me) continue;
          const tx = (e.payload?.txHash as string | undefined) ?? '';
          const positionId = (e.payload?.positionId as string | undefined) ?? '';
          const id = `${e.type}-${tx || positionId || e.ts}`;
          fresh.push({
            id,
            jobId: '',
            type: e.type,
            summary: summaryFor(e.type, e.payload, null, bell),
            ts: e.ts,
            read: readIdsRef.current.has(id),
            href: hrefForType(e.type, ''),
          });
          continue;
        }
        // Financing events. They carry a jobId but the financier is not a deal
        // party, so route by the addresses the payload names.
        if (FINANCE_TYPES.has(e.type)) {
          const financeRole = financeRoleFor(e.type, e.payload, me);
          if (!financeRole) continue;
          const ref =
            (e.payload?.offerId as string | undefined) ??
            (e.payload?.lineId as string | undefined) ??
            String(e.ts);
          const id = `${e.type}-${ref}-${financeRole}`;
          fresh.push({
            id,
            jobId: e.jobId ?? '',
            type: e.type,
            summary: summaryFor(e.type, e.payload, financeRole, bell),
            ts: e.ts,
            read: readIdsRef.current.has(id),
            href: financeHref(e.jobId ?? ''),
          });
          continue;
        }
        if (e.type === 'offer.created') {
          const poster = (e.payload?.buyerUser as string | undefined)?.toLowerCase();
          if (poster !== me || !e.jobId) continue;
          const id = `offer.created-${String(e.payload?.offerId ?? e.ts)}`;
          fresh.push({
            id,
            jobId: e.jobId,
            type: e.type,
            summary: summaryFor(e.type, e.payload, 'buyer', bell),
            ts: e.ts,
            read: readIdsRef.current.has(id),
            href: `/jobs/${e.jobId}`,
          });
          continue;
        }
        // Trend nudge: no jobId, addressed to the seller-user in the payload.
        if (e.type === 'trend.match') {
          const seller = (e.payload?.sellerUser as string | undefined)?.toLowerCase();
          if (seller !== me) continue;
          const id = `trend.match-${e.ts}`;
          fresh.push({
            id,
            jobId: '',
            type: e.type,
            summary: summaryFor(e.type, e.payload, null, bell),
            ts: e.ts,
            read: readIdsRef.current.has(id),
            href: hrefForType(e.type, ''),
          });
          continue;
        }
        if (BRIDGE_TYPES.has(e.type)) {
          const owner = (e.payload?.owner as string | undefined)?.toLowerCase();
          const recipient = (e.payload?.mintRecipient as string | undefined)?.toLowerCase();
          if (owner !== me && recipient !== me) continue;
          const id = bridgeNotificationId(e);
          fresh.push({
            id,
            jobId: '',
            type: e.type,
            summary: bridgeSummary(e, notifyCopyRef.current),
            ts: e.ts,
            read: readIdsRef.current.has(id),
            href: receiptHref(e),
          });
          continue;
        }
        if (!e.jobId) continue;
        const role = roleForEvent(e.payload, me, e.jobId, roleByJobRef.current);
        if (!shouldNotify(e.type, role, e.payload)) continue;
        const id = `${e.jobId}-${e.type}-${e.ts}`;
        fresh.push({
          id,
          jobId: e.jobId,
          type: e.type,
          summary: summaryFor(e.type,
            withTradeType(e.payload, e.jobId, tradeByJobRef.current),
            role,
            bell,
          ),
          ts: e.ts,
          read: readIdsRef.current.has(id),
          href: hrefForType(e.type, e.jobId),
        });
      }
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

  // Hydrate stored notifications + the user's deal jobId/role map on connect.
  useEffect(() => {
    if (!isConnected || !address) {
      setNotifications([]);
      setHydratedFor(null);
      jobIdsRef.current = new Set();
      roleByJobRef.current = new Map();
      tradeByJobRef.current = new Map();
      initialHydrateRef.current = false;
      seenNotificationIdsRef.current = new Set();
      readIdsRef.current = new Set();
      clearedBeforeRef.current = 0;
      return;
    }
    initialHydrateRef.current = false;
    const me = address.toLowerCase();
    readIdsRef.current = loadReadIds(address);
    clearedBeforeRef.current = loadClearedBefore(address);
    const stored = load(address);
    setNotifications(stored);
    // Seed the seen-set with persisted notification ids so the first SSE
    // event after reload doesn't re-fire toasts/sound for items already shown.
    seenNotificationIdsRef.current = new Set(stored.map((n) => n.id));
    setHydratedFor(me);
    // Build the role map first so backfill routes correctly, then backfill.
    void refreshJobIds().then(() => backfill(me));
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
      if (!NOTIFY_TYPES.has(e.type)) return;
      // A live event older than the last "clear all" was already dismissed.
      if (e.ts <= clearedBeforeRef.current) return;

      // Wallet credit / debit: route by the owner address in the payload.
      // Skip the deal-routing machinery so a credit landing in a brand-new
      // wallet shows up even before any deal exists.
      if (WALLET_TYPES.has(e.type)) {
        const owner = (e.payload?.owner as string | undefined)?.toLowerCase();
        if (owner !== me) return;
        const tx = (e.payload?.txHash as string | undefined) ?? '';
        const wallet = (e.payload?.walletAddress as string | undefined) ?? '';
        const id = `${e.type}-${tx || e.ts}-${wallet}`;
        if (seenNotificationIdsRef.current.has(id)) return;
        seenNotificationIdsRef.current.add(id);
        const next: AppNotification = {
          id,
          jobId: '',
          type: e.type,
          summary: summaryFor(e.type, e.payload, null, bell),
          ts: e.ts,
          read: readIdsRef.current.has(id),
          href: receiptHref(e),
          toast: TOAST_TYPES.has(e.type),
        };
        setNotifications((list) => {
          if (list.some((n) => n.id === id)) return list;
          return [next, ...list].slice(0, MAX_STORED);
        });
        if (initialHydrateRef.current) {
          playNotificationSound(e, me, null);
          if (next.toast) {
            toastListeners.forEach((fn) => fn(next));
          }
        }
        return;
      }

      // Financing events. Carry a jobId, but the financier is not a deal party,
      // so route by the addresses the payload names rather than by deal role.
      if (FINANCE_TYPES.has(e.type)) {
        const financeRole = financeRoleFor(e.type, e.payload, me);
        if (!financeRole) return;
        const ref =
          (e.payload?.offerId as string | undefined) ??
          (e.payload?.lineId as string | undefined) ??
          String(e.ts);
        const id = `${e.type}-${ref}-${financeRole}`;
        if (seenNotificationIdsRef.current.has(id)) return;
        seenNotificationIdsRef.current.add(id);
        const next: AppNotification = {
          id,
          jobId: e.jobId ?? '',
          type: e.type,
          summary: summaryFor(e.type, e.payload, financeRole, bell),
          ts: e.ts,
          read: readIdsRef.current.has(id),
          href: financeHref(e.jobId ?? ''),
          toast: TOAST_TYPES.has(e.type),
        };
        setNotifications((list) => {
          if (list.some((n) => n.id === id)) return list;
          return [next, ...list].slice(0, MAX_STORED);
        });
        if (initialHydrateRef.current) {
          playNotificationSound(e, me, financeRole);
          if (next.toast) {
            toastListeners.forEach((fn) => fn(next));
          }
        }
        return;
      }

      // Vault and agent money events. Same shape as the wallet branch above
      // but the owner key varies, so the lookup is data-driven.
      if (MONEY_DIRECT_TYPES.has(e.type)) {
        const key = MONEY_DIRECT_OWNER_KEY[e.type];
        const owner = (e.payload?.[key] as string | undefined)?.toLowerCase();
        if (owner !== me) return;
        const tx = (e.payload?.txHash as string | undefined) ?? '';
        const positionId = (e.payload?.positionId as string | undefined) ?? '';
        const id = `${e.type}-${tx || positionId || e.ts}`;
        if (seenNotificationIdsRef.current.has(id)) return;
        seenNotificationIdsRef.current.add(id);
        const next: AppNotification = {
          id,
          jobId: '',
          type: e.type,
          summary: summaryFor(e.type, e.payload, null, bell),
          ts: e.ts,
          read: readIdsRef.current.has(id),
          href: hrefForType(e.type, ''),
          toast: TOAST_TYPES.has(e.type),
        };
        setNotifications((list) => {
          if (list.some((n) => n.id === id)) return list;
          return [next, ...list].slice(0, MAX_STORED);
        });
        if (initialHydrateRef.current) {
          playNotificationSound(e, me, null);
          if (next.toast) {
            toastListeners.forEach((fn) => fn(next));
          }
        }
        return;
      }

      // A seller answered this viewer's request.
      if (e.type === 'offer.created') {
        const poster = (e.payload?.buyerUser as string | undefined)?.toLowerCase();
        if (poster !== me || !e.jobId) return;
        const id = `offer.created-${String(e.payload?.offerId ?? e.ts)}`;
        if (seenNotificationIdsRef.current.has(id)) return;
        seenNotificationIdsRef.current.add(id);
        const next: AppNotification = {
          id,
          jobId: e.jobId,
          type: e.type,
          summary: summaryFor(e.type, e.payload, 'buyer', bell),
          ts: e.ts,
          read: readIdsRef.current.has(id),
          href: `/jobs/${e.jobId}`,
          toast: true,
        };
        setNotifications((list) => {
          if (list.some((n) => n.id === id)) return list;
          return [next, ...list].slice(0, MAX_STORED);
        });
        if (initialHydrateRef.current) {
          playNotificationSound(e, me, 'buyer');
          toastListeners.forEach((fn) => fn(next));
        }
        return;
      }

      // Trend nudge: no jobId, addressed to the seller-user. Same shape as the
      // wallet/money branches above.
      if (e.type === 'trend.match') {
        const seller = (e.payload?.sellerUser as string | undefined)?.toLowerCase();
        if (seller !== me) return;
        const id = `trend.match-${e.ts}`;
        if (seenNotificationIdsRef.current.has(id)) return;
        seenNotificationIdsRef.current.add(id);
        const next: AppNotification = {
          id,
          jobId: '',
          type: e.type,
          summary: summaryFor(e.type, e.payload, null, bell),
          ts: e.ts,
          read: readIdsRef.current.has(id),
          href: hrefForType(e.type, ''),
          toast: TOAST_TYPES.has(e.type),
        };
        setNotifications((list) => {
          if (list.some((n) => n.id === id)) return list;
          return [next, ...list].slice(0, MAX_STORED);
        });
        if (initialHydrateRef.current) {
          playNotificationSound(e, me, null);
          if (next.toast) {
            toastListeners.forEach((fn) => fn(next));
          }
        }
        return;
      }

      // A cross-chain transfer finished. The stream sends a bridge event in full
      // only to the account that owns it; the owner or recipient check is the
      // second guard, as it is for wallet events.
      if (BRIDGE_TYPES.has(e.type)) {
        const owner = (e.payload?.owner as string | undefined)?.toLowerCase();
        const recipient = (e.payload?.mintRecipient as string | undefined)?.toLowerCase();
        if (owner !== me && recipient !== me) return;
        const id = bridgeNotificationId(e);
        if (seenNotificationIdsRef.current.has(id)) return;
        seenNotificationIdsRef.current.add(id);
        const next: AppNotification = {
          id,
          jobId: '',
          type: e.type,
          summary: bridgeSummary(e, notifyCopyRef.current),
          ts: e.ts,
          read: readIdsRef.current.has(id),
          href: receiptHref(e),
        };
        setNotifications((list) => (list.some((n) => n.id === id) ? list : [next, ...list].slice(0, MAX_STORED)));
        if (initialHydrateRef.current) playNotificationSound(e, me, null);
        return;
      }

      if (!e.jobId) return;

      // Learn this user's role on a freshly-started deal so later events that
      // only carry a jobId still route to the right side. deal.invite.claimed
      // counts too, that's the moment a pending-invite deal first has a real
      // seller wallet bound to it.
      if (
        e.type === 'deal.direct.created' ||
        e.type === 'deal.matched' ||
        e.type === 'deal.invite.claimed'
      ) {
        const buyer = (e.payload?.buyer as string | undefined)?.toLowerCase();
        const seller = (e.payload?.seller as string | undefined)?.toLowerCase();
        const j = e.jobId.toLowerCase();
        if (buyer === me) {
          jobIdsRef.current.add(j);
          roleByJobRef.current.set(j, 'buyer');
        } else if (seller === me) {
          jobIdsRef.current.add(j);
          roleByJobRef.current.set(j, 'seller');
        }
      }

      const role = roleForEvent(e.payload, me, e.jobId, roleByJobRef.current);
      if (!shouldNotify(e.type, role, e.payload)) return;

      const id = `${e.jobId}-${e.type}-${e.ts}`;
      const toast = TOAST_TYPES.has(e.type);
      const next: AppNotification = {
        id,
        jobId: e.jobId,
        type: e.type,
        summary: summaryFor(e.type,
          withTradeType(e.payload, e.jobId, tradeByJobRef.current),
          role,
          bell,
        ),
        ts: e.ts,
        read: readIdsRef.current.has(id),
        href: hrefForType(e.type, e.jobId),
        toast,
      };

      // Dedupe outside the state updater. Running the toast-listener fan-out
      // inside `setNotifications` triggered React's "Cannot update a component
      // while rendering" warning, because each listener calls setState on its
      // own subscriber and updaters can run during another component's render.
      if (seenNotificationIdsRef.current.has(id)) return;
      seenNotificationIdsRef.current.add(id);

      setNotifications((list) => {
        if (list.some((n) => n.id === id)) return list;
        return [next, ...list].slice(0, MAX_STORED);
      });

      if (initialHydrateRef.current) {
        playNotificationSound(e, me, role);
        if (toast) {
          toastListeners.forEach((fn) => fn(next));
        }
      }
    });
  }, [address, isConnected]);

  useEffect(() => {
    notificationsRef.current = notifications;
  }, [notifications]);

  // Persist immediately, not only through the passive effect, so a click that
  // marks a notification read and navigates away in the same tick cannot lose
  // the write.
  const persistNow = useCallback(
    (next: AppNotification[]) => {
      notificationsRef.current = next;
      setNotifications(next);
      save(address, next);
    },
    [address],
  );

  // Remember read ids in the durable set (and persist it) so the state survives
  // bell-cache trimming, a lost cache, and re-login.
  const rememberRead = useCallback(
    (ids: string[]) => {
      for (const id of ids) readIdsRef.current.add(id);
      saveReadIds(address, readIdsRef.current);
    },
    [address],
  );

  const markRead = useCallback(
    (id: string) => {
      rememberRead([id]);
      persistNow(notificationsRef.current.map((n) => (n.id === id ? { ...n, read: true } : n)));
    },
    [persistNow, rememberRead],
  );

  const markAllRead = useCallback(() => {
    rememberRead(notificationsRef.current.map((n) => n.id));
    persistNow(notificationsRef.current.map((n) => ({ ...n, read: true })));
  }, [persistNow, rememberRead]);

  // Clearing dismisses the bell for good. Set a high-water mark at the newest
  // notification's timestamp so backfill + SSE drop everything up to it on the
  // next load; without this they re-fetched the /api/activity window and the
  // cleared items came back. Still record ids read as a belt-and-braces guard.
  const clearAll = useCallback(() => {
    const newest = notificationsRef.current.reduce((m, n) => Math.max(m, n.ts), clearedBeforeRef.current);
    clearedBeforeRef.current = newest;
    saveClearedBefore(address, newest);
    rememberRead(notificationsRef.current.map((n) => n.id));
    persistNow([]);
  }, [address, persistNow, rememberRead]);

  const unreadCount = notifications.reduce((n, x) => n + (x.read ? 0 : 1), 0);

  return { notifications, unreadCount, markRead, markAllRead, clearAll };
}
