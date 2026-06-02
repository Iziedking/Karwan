'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '@/shared/hooks/useAuth';
import { api } from '@/core/api';
import { sfx } from '@/shared/utils/sfx';
import { subscribeLiveEvents } from '@/shared/utils/liveEventBus';
import {
  NOTIFICATION_STORAGE_PREFIX,
  loadReadIds,
  saveReadIds,
  loadClearedBefore,
  saveClearedBefore,
} from '@/shared/utils/notificationStore';
// Re-export so existing call sites can keep importing from the hook module.
export { purgeStoredNotifications } from '@/shared/utils/notificationStore';

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

type Role = 'buyer' | 'seller';

const STORAGE_PREFIX = NOTIFICATION_STORAGE_PREFIX;
const MAX_STORED = 30;

// Events worth bubbling into the bell. Split into agent-deal (route to
// /jobs/[id]) and direct-deal (route to /deals/[id]). same data model after
// match approval, but the URL differs before that.
const MANAGED_TYPES = new Set([
  'deal.matched',
  'deal.match.approved',
  'deal.match.declined',
  'negotiation.near-miss',
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
  // Seller cashes out after settlement; the banner lives on the deal page.
  'cashout.arc.completed',
]);

// Wallet-level events carry no jobId. They route to the owner address in the
// payload and surface on the profile (where balances live).
const WALLET_TYPES = new Set(['wallet.credited', 'wallet.debited']);

// Money-movement events that carry no jobId. Each one names the owner under
// a different payload key depending on the surface that emitted it. The map
// keeps the routing local to one place.
const MONEY_DIRECT_OWNER_KEY: Record<string, 'address' | 'user'> = {
  'vault.deposit': 'address',
  'vault.withdraw.requested': 'address',
  'vault.withdraw.cancelled': 'address',
  'vault.claimed': 'address',
  'vault.cooldown.completed': 'address',
  'agent.funded': 'user',
  'agent.withdrawal': 'user',
};
const MONEY_DIRECT_TYPES = new Set(Object.keys(MONEY_DIRECT_OWNER_KEY));

// Events whose target is the deal action card. Tapping them should land on
// /deals/[id]#action so the user scrolls straight to Mark Delivered / Release /
// Accept rather than the top of the page.
const ACTION_TYPES = new Set([
  'deal.match.approved',
  'deal.direct.created',
  'deal.delivered',
  'deal.review.started',
  'deal.fund.insufficient',
]);

const NOTIFY_TYPES = new Set([
  ...MANAGED_TYPES,
  ...DIRECT_TYPES,
  ...WALLET_TYPES,
  ...MONEY_DIRECT_TYPES,
]);

// High-signal events that should also trigger a toast. Cooldown finishing is
// the rare actionable money event, so it earns a toast; the rest of the vault
// and agent events sit quietly in the bell.
const TOAST_TYPES = new Set([
  'deal.matched',
  'deal.match.approved',
  'deal.cancel.proposed',
  'deal.fund.insufficient',
  'negotiation.near-miss',
  'job.expired',
  'wallet.credited',
  'wallet.debited',
  'vault.cooldown.completed',
]);

// Which party should receive each event. This is the fix for notifications
// landing at the wrong party: a deal event is no longer shown to whoever is a
// party, it is shown only to the role the message is written for. 'both' shows
// to either side with role-aware copy. cancel.proposed / cancel.declined route
// by the proposer in the payload (handled in shouldNotify).
const RECIPIENT: Record<string, Role | 'both'> = {
  // Managed (agent) flow.
  'deal.matched': 'both',
  'deal.match.approved': 'both',
  'deal.match.declined': 'both',
  'job.expired': 'buyer',
  'listing.matched': 'seller',
  'agent.declined': 'buyer',
  // Direct flow.
  'deal.direct.created': 'seller', // buyer just created it; the seller must act
  'deal.accepted': 'buyer', // the seller knows they accepted; the buyer's agent funded
  'deal.delivered': 'buyer', // the buyer verifies and releases
  'deal.fund.insufficient': 'buyer',
  'escrow.milestone.released': 'both',
  'deal.review.started': 'buyer',
  'deal.review.heartbeat': 'seller', // the buyer extended; the seller cares
  'deal.auto_released': 'both',
  'escrow.settled': 'both',
  'deal.disputed': 'both',
  'deal.cancelled': 'both',
  'deal.cancel.proposed': 'both', // special-cased to the counterparty below
  'deal.cancel.declined': 'both', // special-cased to the proposer below
  // The seller pulls funds out after settlement; banner lives on the deal page.
  'cashout.arc.completed': 'seller',
};

function hrefForType(type: string, jobId: string): string {
  // listing.matched fires when a seller's offer matches a buyer's brief and the
  // agent bids — before any match proposal exists. The buyer's job page is
  // private to the two parties (and to the seller only once a proposal names
  // them), so deep-linking there dead-ends the seller on "this deal is private."
  // Send them to their own dashboard, where the bid and any resulting match
  // surface. Once a proposal exists, deal.matched routes them to /jobs/[id].
  if (type === 'listing.matched') return '/seller';
  if (WALLET_TYPES.has(type)) return '/profile';
  if (type.startsWith('vault.')) return '/stake';
  if (type.startsWith('agent.')) return '/profile';
  // Action events land on the deal page's action card so the user reaches
  // Mark Delivered / Release / Accept without a second scroll.
  if (ACTION_TYPES.has(type)) return `/deals/${jobId}#action`;
  return MANAGED_TYPES.has(type) ? `/jobs/${jobId}` : `/deals/${jobId}`;
}

function walletLabelFromPayload(payload: Record<string, unknown> | undefined): string {
  const label = (payload?.walletLabel as string | undefined) ?? '';
  if (label) return label;
  const role = (payload?.walletRole as string | undefined) ?? '';
  if (role === 'identity') return 'identity wallet';
  if (role === 'buyerAgent') return 'buyer agent wallet';
  if (role === 'sellerAgent') return 'seller agent wallet';
  return 'wallet';
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
  // 'both' means "either party to THIS deal" — never "everyone." Require a
  // resolved role so a 'both' event from a deal the viewer isn't part of (which
  // the global SSE bus and the activity feed both carry) doesn't leak into their
  // bell as a generic notification. role is non-null only when the viewer is a
  // party (named in the payload, or the jobId is in their deal map).
  if (rule === 'both') return role != null;
  return role === rule;
}

function summaryFor(
  type: string,
  payload: Record<string, unknown> | undefined,
  role: Role | null,
): string {
  const priceUsdc = (payload?.agreedPriceUsdc as string | undefined) ?? '';
  const askingPriceUsdc = (payload?.askingPriceUsdc as string | number | undefined) ?? '';
  const dealAmount = (payload?.dealAmountUsdc as string | undefined) ?? '';
  const reason = (payload?.reason as string | undefined) ?? '';
  switch (type) {
    case 'deal.matched':
      return role === 'seller'
        ? priceUsdc
          ? `A buyer matched your bid at ${priceUsdc} USDC. Accept to fund escrow.`
          : 'A buyer matched your bid. Accept to fund escrow.'
        : priceUsdc
          ? `Your agent found a match at ${priceUsdc} USDC. Tap to review.`
          : 'Your agent found a match. Tap to review.';
    case 'deal.match.approved':
      return role === 'seller'
        ? priceUsdc
          ? `Match accepted at ${priceUsdc} USDC. Escrow funded. Deliver when ready.`
          : 'Match accepted. Escrow funded. Deliver when ready.'
        : priceUsdc
          ? `Seller accepted at ${priceUsdc} USDC. Escrow funded.`
          : 'Seller accepted. Escrow funded.';
    case 'deal.match.declined':
      return role === 'seller'
        ? 'You declined this match.'
        : 'The seller declined this match. Post a fresh request to retry.';
    case 'job.expired':
      return 'A request expired with no match. Repost to retry.';
    case 'listing.matched':
      return askingPriceUsdc
        ? `Karwan matched your offer to a request at ${askingPriceUsdc} USDC.`
        : 'Karwan matched your offer to an open request.';
    case 'agent.declined':
      return reason ? `Agent ended negotiation: ${reason}` : 'Agent ended the negotiation.';
    case 'negotiation.near-miss': {
      const proceed = (payload?.proceedPriceUsdc as string | undefined) ?? '';
      const gap = (payload?.gapUsdc as string | undefined) ?? '';
      const where = role === 'seller' ? 'below your floor' : 'above your cap';
      return proceed
        ? `Karwan found a deal at ${proceed} USDC, ${gap} ${where}. Tap to proceed or pass.`
        : `Karwan found a deal just ${where}. Tap to proceed or pass.`;
    }
    case 'deal.direct.created':
      // Seller-facing: the buyer opened the deal and is waiting on the seller.
      return dealAmount
        ? `A buyer opened a deal with you at ${dealAmount} USDC. Accept to proceed.`
        : 'A buyer opened a deal with you. Accept to proceed.';
    case 'deal.accepted':
      // Buyer-facing: their agent funded the escrow after the seller accepted.
      return 'Seller accepted. Your agent funded the escrow.';
    case 'deal.delivered':
      // Buyer-facing: the buyer verifies and releases.
      return 'Seller marked the work delivered. Release the first milestone.';
    case 'deal.fund.insufficient':
      return 'Your buyer agent needs USDC to fund escrow. Top it up from your profile.';
    case 'escrow.milestone.released':
      return role === 'seller' ? 'A milestone was released to you.' : 'A milestone was released.';
    case 'deal.review.started':
      return 'Review window opened. Release the final milestone when ready.';
    case 'deal.review.heartbeat':
      return 'The buyer extended the review window.';
    case 'deal.auto_released':
      return role === 'seller'
        ? 'Review window passed. The final milestone auto-released to you.'
        : 'Review window passed. The final milestone auto-released.';
    case 'escrow.settled':
      return 'Deal settled in full. Reputation recorded on chain.';
    case 'deal.disputed':
      return 'Deal moved to dispute. Resolution is off-platform.';
    case 'deal.cancelled':
      return 'Deal cancelled and refunded.';
    case 'deal.cancel.proposed':
      return reason
        ? `Cancellation proposed by your counterparty: ${reason.slice(0, 60)}`
        : 'Cancellation proposed by your counterparty.';
    case 'deal.cancel.declined':
      return 'Your cancellation proposal was declined.';
    case 'wallet.credited': {
      const credited = (payload?.amountUsdc as string | undefined) ?? '0';
      const credit = trimUsdcLabel(credited);
      const label = walletLabelFromPayload(payload);
      return `+${credit} USDC landed in your ${label}.`;
    }
    case 'wallet.debited': {
      const debited = (payload?.amountUsdc as string | undefined) ?? '0';
      const debit = trimUsdcLabel(debited);
      const label = walletLabelFromPayload(payload);
      return `-${debit} USDC left your ${label}.`;
    }
    case 'vault.deposit': {
      const raw = (payload?.amountUsdc as string | undefined) ?? '0';
      return `Staked ${trimUsdcLabel(raw)} USDC.`;
    }
    case 'vault.withdraw.requested': {
      const raw = (payload?.principalUsdc as string | undefined) ?? '';
      const amount = raw ? `${trimUsdcLabel(raw)} USDC` : 'your position';
      return `Cooldown started on ${amount}. Claimable in 3 days.`;
    }
    case 'vault.withdraw.cancelled': {
      const raw = (payload?.principalUsdc as string | undefined) ?? '';
      const amount = raw ? `${trimUsdcLabel(raw)} USDC` : 'the position';
      return `Cooldown cancelled. ${amount} back to active stake.`;
    }
    case 'vault.claimed': {
      const raw = (payload?.principalUsdc as string | undefined) ?? '';
      const amount = raw ? `${trimUsdcLabel(raw)} USDC` : 'your stake';
      return `Withdrew ${amount} from the vault.`;
    }
    case 'vault.cooldown.completed': {
      const raw = (payload?.principalUsdc as string | undefined) ?? '';
      const amount = raw ? `${trimUsdcLabel(raw)} USDC` : 'your position';
      return `Cooldown finished. ${amount} ready to claim.`;
    }
    case 'cashout.arc.completed': {
      const raw = (payload?.amountUsdc as string | undefined) ?? '0';
      return `Cashed out ${trimUsdcLabel(raw)} USDC to your wallet.`;
    }
    case 'agent.funded': {
      const raw = (payload?.amountUsdc as string | undefined) ?? '0';
      const which = (payload?.agent as string | undefined) ?? 'agent';
      const seed = payload?.seed === true;
      return seed
        ? `Seeded ${trimUsdcLabel(raw)} USDC into your ${which} agent.`
        : `Funded ${trimUsdcLabel(raw)} USDC into your ${which} agent.`;
    }
    case 'agent.withdrawal': {
      const raw = (payload?.amountUsdc as string | undefined) ?? '0';
      const which = (payload?.agent as string | undefined) ?? 'agent';
      return `Pulled ${trimUsdcLabel(raw)} USDC out of your ${which} agent.`;
    }
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
  // jobIds the user is a party to + their role in each, so events that only
  // carry a jobId still route to the correct side.
  const jobIdsRef = useRef<Set<string>>(new Set());
  const roleByJobRef = useRef<Map<string, Role>>(new Map());
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
      const res = await api.directDeals(address);
      const ids = new Set<string>();
      const roles = new Map<string, Role>();
      for (const d of res.deals) {
        const j = d.jobId.toLowerCase();
        ids.add(j);
        roles.set(j, d.buyer.toLowerCase() === me ? 'buyer' : 'seller');
      }
      jobIdsRef.current = ids;
      roleByJobRef.current = roles;
    } catch {
      /* keep whatever we have */
    }
  }, [address]);

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
            summary: summaryFor(e.type, e.payload, null),
            ts: e.ts,
            read: readIdsRef.current.has(id),
            href: hrefForType(e.type, ''),
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
            summary: summaryFor(e.type, e.payload, null),
            ts: e.ts,
            read: readIdsRef.current.has(id),
            href: hrefForType(e.type, ''),
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
          summary: summaryFor(e.type, e.payload, role),
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
          summary: summaryFor(e.type, e.payload, null),
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
          try {
            sfx.send();
          } catch {
            /* ignore */
          }
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
          summary: summaryFor(e.type, e.payload, null),
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
          try {
            sfx.send();
          } catch {
            /* ignore */
          }
          if (next.toast) {
            toastListeners.forEach((fn) => fn(next));
          }
        }
        return;
      }

      if (!e.jobId) return;

      // Learn this user's role on a freshly-started deal so later events that
      // only carry a jobId still route to the right side.
      if (e.type === 'deal.direct.created' || e.type === 'deal.matched') {
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
        summary: summaryFor(e.type, e.payload, role),
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
