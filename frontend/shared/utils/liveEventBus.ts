'use client';
import { api, type ChainEvent } from '@/core/api';

// Every data event rides ONE fixed SSE name (see backend routes/events.ts); the
// real event type lives inside the JSON payload (`.type`). Listening to a single
// name means the client can never drift out of sync with the backend's event
// union the way the old per-type whitelist did (it silently dropped newer types
// like market.scanned and deal.deadline.passed from the live feed).
const SSE_DATA_EVENT = 'karwan';

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

// The signed-in caller for the current connection. The live stream is gated
// server-side by the authenticated session (the cookie ridden via
// withCredentials), so non-parties only ever receive a privacy pulse. When the
// caller changes (sign in / out) we re-handshake so the new session applies.
let currentCaller: string | null = null;

export function setLiveCaller(caller: string | null) {
  const next = caller ? caller.toLowerCase() : null;
  if (next === currentCaller) return;
  currentCaller = next;
  if (source) {
    teardownSource();
    if (subscribers.size > 0 || statusSubscribers.size > 0) ensureSource();
  }
}

function ensureSource() {
  if (source) return;
  setStatus('connecting');
  // withCredentials sends the session cookie so the backend can scope the
  // stream to this caller (full detail for their own deals, a pulse otherwise).
  source = new EventSource(api.eventsUrl(), { withCredentials: true });
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
  source.addEventListener(SSE_DATA_EVENT, onMessage);
}

function teardownSource() {
  if (!source) return;
  if (openHandler) {
    source.removeEventListener(SSE_DATA_EVENT, openHandler);
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
