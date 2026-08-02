'use client';
import { useEffect } from 'react';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { subscribeLiveEvents } from '@/shared/utils/liveEventBus';
import { AUTH_CHANGED_EVENT } from '@/shared/hooks/useAuth';
import type { ChainEvent } from '@/core/api';
import { qk } from './queryKeys';

/// SSE → invalidate routing table. Each backend event type maps to the
/// query-key prefixes its arrival makes stale. A single shared subscriber
/// reads the latest event and asks the QueryClient to refetch only what
/// changed; consumer hooks don't need to know which events affect them.
///
/// Bare prefixes (eg `['deals']`) match every key under that branch, so
/// invalidating `qk.deals.all()` re-runs both the list and any open item
/// queries. We invalidate; react-query handles whether anything is mounted
/// and whether the data is genuinely stale.
/// Every backend event that mutates a direct/managed deal's state. Kept as a
/// Set (mirrors the backend event union in events.ts) so a new event type is a
/// one-line add, not another `||`. Missing entries here are silent stale-state
/// bugs: a user parked on the deal page sees old data until they navigate away.
const DEAL_EVENTS = new Set<string>([
  'deal.direct.created',
  'deal.direct.edited',
  'deal.accepted',
  'deal.delivered',
  'deal.delivery.flagged',
  'deal.delivery.cleared',
  'deal.matched',
  'deal.match.approved',
  'deal.match.declined',
  'deal.match.raised',
  'deal.review.started',
  'deal.review.heartbeat',
  'deal.acceptance.expired',
  'deal.deadline.passed',
  'deal.delay.appealed',
  'deal.delay.responded',
  'deal.delay.auto_released',
  'deal.extension.requested',
  'deal.extension.approved',
  'deal.extension.declined',
  'deal.fund.insufficient',
  'deal.invite.claimed',
  'deal.disputed',
  'deal.cancelled',
  'deal.cancel.proposed',
  'deal.cancel.declined',
  'escrow.approved',
  'escrow.funded',
  'escrow.accepted',
  'escrow.milestone.released',
  'escrow.released_from_dispute',
  'escrow.settled',
  // v2b security agent
  'security.hold',
  'security.hold.cleared',
  'security.attested',
  'security.match.evaluated',
]);

/// wagmi keys every `useBalance` under this prefix, so invalidating it refreshes
/// the chain reads for every address and chain at once. Matching the prefix
/// rather than reconstructing each full key means a new balance surface is
/// covered the day it is added, without anyone remembering to register it.
const WAGMI_BALANCE_KEY = ['balance'] as const;

/// Did this event move money that a chain balance would show?
///
/// Deliberately broader than the deal table: a top up, a bridge landing or a
/// stake claim never touches a deal, and those are exactly the moments somebody
/// is staring at their balance waiting for it to change.
function touchesMoney(event: ChainEvent): boolean {
  const t = event.type;
  return (
    DEAL_EVENTS.has(t) ||
    t.startsWith('escrow.') ||
    t.startsWith('vault.') ||
    t.startsWith('bridge.') ||
    t.startsWith('gateway.') ||
    t.startsWith('wallet.') ||
    t.startsWith('payment.') ||
    t.startsWith('yield.')
  );
}

function routes(event: ChainEvent): readonly (readonly string[])[] {
  const t = event.type;

  // Deal lifecycle. Anything that mutates a deal invalidates the per-user
  // list AND the item; sibling Money / balances / reputation surfaces also
  // depend on settled-vs-active classification.
  if (DEAL_EVENTS.has(t)) {
    // Deal lifecycle SSE doesn't carry the affected address — invalidate
    // every per-wallet money view by its top-level prefix and let
    // react-query refetch only the keys with mounted observers.
    return [
      qk.deals.all(),
      qk.balances.all(),
      ['wallet-overview'],
      qk.dealsStats(),
    ];
  }

  // Auction lifecycle on a specific job. Triggers a job-detail refetch
  // and the buyer's bid list. Job snapshot covers both.
  if (
    t === 'bid.scored' ||
    t === 'bid.submitted' ||
    t === 'counter.issued' ||
    t === 'counter.evaluated' ||
    t === 'counter.received' ||
    t === 'counter.response.submitted' ||
    t === 'bid.accepted' ||
    t === 'job.posted' ||
    t === 'job.tracked' ||
    t === 'job.expired'
  ) {
    return [qk.job.all()];
  }

  // Reputation. Only `reputation.recorded` ever moves the score off-chain;
  // settlement and slash paths emit it explicitly.
  if (t === 'reputation.recorded') {
    return [['reputation']];
  }

  // Bridge. CCTP relay progress doesn't invalidate global lists; the
  // bridge UI consumes the raw event stream directly.
  if (
    t === 'bridge.burned' ||
    t === 'bridge.attested' ||
    t === 'bridge.minted' ||
    t === 'bridge.error'
  ) {
    return [];
  }

  // Listings, chat, telegram, agent ops, fund alerts — handled per-hook
  // (chat keeps its own subscriber; the rest are infrequent enough that a
  // background re-poll catches them).
  return [];
}

/// Mount once near the QueryClientProvider. Listens to the shared SSE bus
/// and translates events into targeted invalidations. Replaces every
/// per-hook REFRESH_TRIGGERS / setTimeout(refresh, 400) we used to wire by
/// hand.
export function QueryInvalidator() {
  const qc = useQueryClient();

  // Auth transitions. When SIWE sign-in completes (or a sign-out happens),
  // every private read may resolve differently: a query that 401'd during the
  // pre-signature window should refetch now that the session cookie is set.
  // Invalidate the whole cache once; react-query refetches only the keys with
  // mounted observers, so this is cheap. This is what makes the session-only
  // read gates feel seamless instead of stranding a "sign in" state.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onAuth = () => {
      qc.invalidateQueries();
    };
    window.addEventListener(AUTH_CHANGED_EVENT, onAuth);
    return () => window.removeEventListener(AUTH_CHANGED_EVENT, onAuth);
  }, [qc]);

  useEffect(() => {
    return subscribeLiveEvents((event) => {
      const keys = routes(event);
      const money = touchesMoney(event);
      if (keys.length === 0 && !money) return;
      // Small delay so the backend has written its store update before the
      // refetch lands; matches the hand-rolled 400ms timeouts we used to
      // scatter through the hooks.
      const t = setTimeout(() => {
        for (const key of keys) {
          if (key.length === 0) continue;
          qc.invalidateQueries({ queryKey: key as unknown as readonly unknown[] });
        }
        // Chain balances too, not just the backend's view of them.
        //
        // The routing table above only knows `qk.*` keys, which are the
        // queries this app defines. wagmi's useBalance lives under its own
        // ['balance', ...] key, so every chain balance on the profile was
        // invisible to SSE and only ever refreshed on its own timer. That is
        // why the balance could lag an event it was caused by.
        if (money) qc.invalidateQueries({ queryKey: WAGMI_BALANCE_KEY });
      }, 400);
      return () => clearTimeout(t);
    });
  }, [qc]);
  return null;
}

/// Re-exported for non-React call sites that need to invalidate (eg.
/// mutation onSuccess callbacks outside a component).
export function invalidateAfterMutation(
  qc: QueryClient,
  keys: readonly (readonly unknown[])[],
): void {
  for (const key of keys) {
    if (key.length === 0) continue;
    qc.invalidateQueries({ queryKey: key });
  }
}
