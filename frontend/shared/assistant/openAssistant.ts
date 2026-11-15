import { rememberReturn } from '@/features/assistant/assistantReturn';

/// The way in to the assistant page (view 57): tapping Aman, Ctrl+K or Cmd+K,
/// the Profile row, or any screen that hands a question over. The signed-in
/// shell listens for ASSISTANT_OPEN_EVENT once (useAssistantShortcut).

export const ASSISTANT_OPEN_EVENT = 'karwan:assistant-open';
/// What a person asked to bring to a person on Help and support, per tab, taken once.
export const PERSON_KEY = 'karwan:help-carry';

export type AssistantOpenDetail = { to: 'assistant' } | { to: 'person'; href: string };

export interface PersonCarry { message: string; dealId: string | null }

export function openAssistant(pathname: string, push: (href: string) => void): void {
  rememberReturn(pathname);
  push('/assistant');
}

export function announceOpen(detail: AssistantOpenDetail): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent<AssistantOpenDetail>(ASSISTANT_OPEN_EVENT, { detail }));
}

interface KeyLike { key: string; ctrlKey: boolean; metaKey: boolean; altKey: boolean; target: EventTarget | null }

function typing(target: EventTarget | null): boolean {
  if (!target || typeof target !== 'object') return false;
  const el = target as { tagName?: string; isContentEditable?: boolean };
  return el.isContentEditable === true || el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT';
}

export function isShortcut(e: KeyLike): boolean {
  return (e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === 'k' && !typing(e.target);
}

export function carryForPerson(carry: PersonCarry): void {
  try { sessionStorage.setItem(PERSON_KEY, JSON.stringify(carry)); } catch { /* blocked storage: Help opens with an empty box */ }
}

export function takePersonCarry(): PersonCarry | null {
  try {
    const raw = sessionStorage.getItem(PERSON_KEY);
    sessionStorage.removeItem(PERSON_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as Partial<PersonCarry>;
    if (typeof v.message !== 'string') return null;
    return { message: v.message, dealId: typeof v.dealId === 'string' ? v.dealId : null };
  } catch { return null; }
}
