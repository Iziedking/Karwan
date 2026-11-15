import { carryAsk } from '@/features/assistant/carriedAsk';
import { announceOpen, carryForPerson } from './openAssistant';

/// Opens the assistant page from anywhere, optionally with a question to send
/// there (view 57). The names stay so every caller keeps working.

type Turn = { role: 'user' | 'assistant'; content: string };

export function openHelp(prefill?: string, opts: { send?: boolean } = {}): void {
  if (typeof window === 'undefined') return;
  if (opts.send && prefill) carryAsk(prefill);
  announceOpen({ to: 'assistant' });
}

/// The assistant could not do it, or the person asked for one: Help and support
/// opens with what they last said ready to send, and the deal it is about.
export function callPerson(context: Turn[], options: { message?: string; dealId?: string } = {}): void {
  if (typeof window === 'undefined') return;
  const lastSaid = [...context].reverse().find((t) => t.role === 'user')?.content ?? '';
  carryForPerson({ message: (options.message ?? lastSaid).trim(), dealId: options.dealId ?? null });
  announceOpen({ to: 'person', href: options.dealId ? `/profile/help?deal=${encodeURIComponent(options.dealId)}` : '/profile/help' });
}
