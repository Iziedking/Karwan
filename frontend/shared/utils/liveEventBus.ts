'use client';
import { api, type ChainEvent } from '@/core/api';

// All named SSE event types the backend may emit. Adding a new type means
// adding it here AND on the consumer side; the bus only forwards types it
// listens for. Keep this list in sync with backend's KarwanEventType union.
const SSE_TYPES = [
  'open',
  'job.posted',
  'job.tracked',
  'job.expired',
  'bid.scored',
  'bid.submitted',
  'counter.issued',
  'counter.received',
  'counter.evaluated',
  'counter.response.submitted',
  'bid.accepted',
  'escrow.approved',
  'escrow.funded',
  'escrow.milestone.released',
  'escrow.settled',
  'bridge.burned',
  'bridge.attested',
  'bridge.minted',
  'bridge.error',
  'reputation.recorded',
  'deal.direct.created',
  'deal.accepted',
  'deal.delivered',
  'deal.delivery.flagged',
  'deal.delivery.cleared',
  'deal.matched',
  'deal.match.declined',
  'deal.match.approved',
  'deal.review.started',
  'deal.review.heartbeat',
  'deal.auto_released',
  'deal.disputed',
  'deal.cancelled',
  'deal.cancel.proposed',
  'deal.cancel.declined',
  'deal.fund.insufficient',
  'listing.posted',
  'listing.matched',
  'chat.message',
  'telegram.linked',
  'agent.activated',
  'agent.withdrawal',
  'agent.skipped',
  'agent.declined',
  'agent.error',
];

type Handler = (event: ChainEvent) => void;
export type LiveStatus = 'connecting' | 'live' | 'offline';
type StatusHandler = (s: LiveStatus) => void;

let source: EventSource | null = null;
let openHandler: ((e: MessageEvent) => void) | null = null;
let onOpen: (() => void) | null = null;
let onError: (() => void) | null = null;
const subscribers = new Set<Handler>();
const statusSubscribers = new Set<StatusHandler>();
let status: LiveStatus = 'connecting';
let closeTimer: ReturnType<typeof setTimeout> | null = null;

function setStatus(next: LiveStatus) {
  if (status === next) return;
  status = next;
  for (const s of statusSubscribers) s(next);
}

function ensureSource() {
  if (source) return;
  setStatus('connecting');
  source = new EventSource(api.eventsUrl());
  const onMessage = (e: MessageEvent) => {
    try {
      const parsed = JSON.parse(e.data) as ChainEvent;
      for (const h of subscribers) h(parsed);
    } catch {
      /* malformed payload. ignore */
    }
  };
  openHandler = onMessage;
  onOpen = () => setStatus('live');
  onError = () => setStatus('offline');
  source.addEventListener('open', onOpen);
  source.onopen = onOpen;
  source.onerror = onError;
  for (const t of SSE_TYPES) source.addEventListener(t, onMessage);
}

function teardownSource() {
  if (!source) return;
  if (openHandler) {
    for (const t of SSE_TYPES) source.removeEventListener(t, openHandler);
  }
  if (onOpen) source.removeEventListener('open', onOpen);
  source.close();
  source = null;
  openHandler = null;
  onOpen = null;
  onError = null;
  setStatus('connecting');
}

/// One shared EventSource for the whole tab. Browsers cap at 6 connections per
/// origin, so opening a fresh stream per hook (Bell + LiveDot + useChat +
/// useDirectDeals + useBridge + ...) starves real fetches. This bus opens the
/// stream lazily on the first subscriber and closes it 5s after the last one
/// leaves, so a quick remount-then-mount doesn't churn the connection.
export function subscribeLiveEvents(handler: Handler): () => void {
  if (closeTimer) {
    clearTimeout(closeTimer);
    closeTimer = null;
  }
  ensureSource();
  subscribers.add(handler);
  return () => {
    subscribers.delete(handler);
    maybeScheduleTeardown();
  };
}

/// Subscribe to connection-state changes (connecting / live / offline). Counts
/// toward the active subscriber set so opening LiveDot alone is enough to keep
/// the underlying stream open.
export function subscribeLiveStatus(handler: StatusHandler): () => void {
  if (closeTimer) {
    clearTimeout(closeTimer);
    closeTimer = null;
  }
  ensureSource();
  statusSubscribers.add(handler);
  handler(status);
  return () => {
    statusSubscribers.delete(handler);
    maybeScheduleTeardown();
  };
}

function maybeScheduleTeardown() {
  if (subscribers.size > 0 || statusSubscribers.size > 0) return;
  closeTimer = setTimeout(() => {
    if (subscribers.size === 0 && statusSubscribers.size === 0) teardownSource();
    closeTimer = null;
  }, 5_000);
}
