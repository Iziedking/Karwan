import type { ConfirmRequired, PresenceAction, PresenceMethod } from '@/core/api';
import type { ConfirmPresenceCopy } from '@/shared/i18n/messages/confirmPresence';

export type ConfirmView =
  | { step: 'enrol'; via: 'email_code' | 'open_link' }
  | { step: 'add_email' }
  | { step: 'confirm'; methods: PresenceMethod[]; pinLockedUntil: number | null }
  | { step: 'reset' }
  | { step: 'done' };

export const fillIn = (template: string, values: Record<string, string>) =>
  template.replace(/\{(\w+)\}/g, (whole, key: string) => values[key] ?? whole);

/// What the sheet shows first: setting up a first PIN or passkey, or the ways
/// this person can confirm, a passkey first when they have one.
export function confirmView(required: ConfirmRequired, now: number): ConfirmView {
  if (required.enrol === 'add_email') return { step: 'add_email' };
  if (required.enrol) return { step: 'enrol', via: required.enrol };
  const methods: PresenceMethod[] = required.methods.includes('wallet')
    ? ['wallet']
    : [
        ...(required.passkeys > 0 && required.methods.includes('passkey') ? (['passkey'] as const) : []),
        ...(required.pinSet && required.methods.includes('pin') ? (['pin'] as const) : []),
      ];
  const locked = required.pinLockedUntil !== null && required.pinLockedUntil > now ? required.pinLockedUntil : null;
  return { step: 'confirm', methods, pinLockedUntil: locked };
}

export function formatMicros(micros: string): string {
  const padded = micros.padStart(7, '0');
  const whole = padded.slice(0, -6).replace(/^0+(?=\d)/, '');
  const fraction = padded.slice(-6).replace(/0+$/, '');
  return fraction ? `${whole}.${fraction}` : whole;
}

/// A shortened address that stays one left-to-right piece inside any
/// sentence: isolated from the text around it (Arabic included) and never
/// broken at the ellipsis.
export function shortAddress(address: string): string {
  const short = address.length <= 12 ? address : `${address.slice(0, address.startsWith('0x') ? 6 : 4)}\u2060…\u2060${address.slice(-4)}`;
  return `\u2066${short}\u2069`;
}

/// The consequence in words, then any line the person should read before confirming.
export function actionLines(action: PresenceAction, copy: ConfirmPresenceCopy): { headline: string; lines: string[] } {
  const amount = action.amountMicros === null ? '' : formatMicros(action.amountMicros);
  switch (action.kind) {
    case 'move_out':
      return {
        headline: fillIn(copy.moveOut, { amount, to: shortAddress(action.recipient ?? '') }),
        lines: action.detail.feeMicros ? [fillIn(copy.fee, { fee: formatMicros(action.detail.feeMicros) })] : [],
      };
    case 'deal_insurance':
      return { headline: fillIn(copy.insurance, { amount }), lines: [copy.insuranceLine] };
    case 'record_setup':
      return {
        headline: copy.setup,
        lines: [
          fillIn(copy.setupLine, {
            perPayment: formatMicros(action.detail.perPayment ?? '0'),
            total: formatMicros(action.detail.total ?? '0'),
          }),
        ],
      };
    case 'factor_change':
      return { headline: copy.factor, lines: [] };
  }
}
