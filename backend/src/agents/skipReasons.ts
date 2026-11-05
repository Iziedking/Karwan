import type { KarwanEvent } from '../events.js';

/// Whether an event is an agent passing on a request (view 52, step 0). An
/// agent that offered is never a pass: `agent.link-needed`, and the older
/// `agent.skipped` events logged with `offering: true` before 5 Nov 2026.
export function isPass(e: Pick<KarwanEvent, 'type' | 'payload'>): boolean {
  if (e.type === 'agent.declined') return true;
  if (e.type !== 'agent.skipped') return false;
  return (e.payload as Record<string, unknown> | undefined)?.offering !== true;
}
