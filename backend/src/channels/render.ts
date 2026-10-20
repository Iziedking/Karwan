import type { AssistantAction, ConfirmAction } from '../assistant/actions.js';

export type TemplateName = 'match_found' | 'confirm_work' | 'deal_update' | 'verification_result';

export type OutMessage =
  | { kind: 'text'; body: string }
  | { kind: 'buttons'; body: string; buttons: { id: string; title: string }[] }
  | { kind: 'template'; name: TemplateName; params: string[]; buttonIds?: string[] }
  /// A step finished on a Karwan page, opened from a button where the channel
  /// has link buttons and from the address in the text where it does not.
  | { kind: 'link'; body: string; label: string; url: string };

// WhatsApp Cloud API limits, the tighter of the two channels.
const TEXT_MAX = 4096;
const INTERACTIVE_BODY_MAX = 1024;
const BUTTON_TITLE_MAX = 20;

/// Turn one assistant reply and its actions into chat messages. A confirm
/// card becomes a message with Confirm and Cancel buttons whose ids carry the
/// card id, so a tap can be matched back to the exact card. Navigate actions
/// become links under the reply.
export function renderTurn(reply: string, actions: AssistantAction[] | undefined, webBase: string): OutMessage[] {
  const links = (actions ?? [])
    .filter((a): a is Extract<AssistantAction, { kind: 'navigate' }> => a.kind === 'navigate')
    .map((a) => `${a.label}: ${webBase}${a.href}`);
  const text = [reply.trim(), links.join('\n')].filter(Boolean).join('\n\n');

  const out: OutMessage[] = splitText(text).map((body) => ({ kind: 'text', body }));
  for (const a of actions ?? []) {
    if (a.kind === 'confirm') out.push(renderConfirm(a));
  }
  return out;
}

export function renderConfirm(a: ConfirmAction): OutMessage {
  const lines = [`*${a.title}*`];
  if (a.summary) lines.push(a.summary);
  if (a.fields.length) lines.push('', ...a.fields.map((f) => (f.label ? `${f.label}: ${f.value}` : f.value)));
  if (a.warning) lines.push('', a.warning);
  return {
    kind: 'buttons',
    body: clip(lines.join('\n'), INTERACTIVE_BODY_MAX),
    buttons: [
      { id: `confirm:${a.id}`, title: clip(a.confirmLabel ?? 'Confirm', BUTTON_TITLE_MAX) },
      { id: `cancel:${a.id}`, title: clip(a.cancelLabel ?? 'Cancel', BUTTON_TITLE_MAX) },
    ],
  };
}

/// Split on paragraph, then line, then word boundaries so every piece fits.
function splitText(text: string): string[] {
  if (!text) return [];
  const pieces: string[] = [];
  let current = '';
  for (const unit of text.split(/(?<=\n\n)/)) {
    if ((current + unit).length <= TEXT_MAX) {
      current += unit;
      continue;
    }
    if (current) pieces.push(current.trim());
    current = '';
    let rest = unit;
    while (rest.length > TEXT_MAX) {
      const cut = boundary(rest, TEXT_MAX);
      pieces.push(rest.slice(0, cut).trim());
      rest = rest.slice(cut);
    }
    current = rest;
  }
  if (current.trim()) pieces.push(current.trim());
  return pieces;
}

function boundary(s: string, max: number): number {
  const window = s.slice(0, max);
  const at = Math.max(window.lastIndexOf('\n'), window.lastIndexOf(' '));
  return at > max / 2 ? at : max;
}

function clip(s: string, max: number): string {
  if (s.length <= max) return s;
  const room = max - 3;
  return `${s.slice(0, boundary(s, room)).trimEnd()}...`;
}
