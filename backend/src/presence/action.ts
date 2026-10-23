import { createHash } from 'node:crypto';

/// The actions a person must be present for (spec decision 13). Paying,
/// releasing and every other deal step are signed by the agents unasked.
export type PresenceKind = 'record_setup' | 'deal_insurance' | 'move_out' | 'factor_change';

export interface PresenceAction {
  kind: PresenceKind;
  wallet: string;
  amountMicros: string | null;
  recipient: string | null;
  detail: Record<string, string>;
}

const KIND_WORDS: Record<PresenceKind, string> = {
  record_setup: 'Set up your Karwan record',
  deal_insurance: 'Put up deal insurance',
  move_out: 'Send money out of Karwan',
  factor_change: 'Change how you confirm',
};

export function presenceAction(input: Omit<PresenceAction, 'detail'> & { detail?: Record<string, string> }): PresenceAction {
  if (input.amountMicros !== null && !/^(0|[1-9]\d*)$/.test(input.amountMicros)) {
    throw new Error(`amountMicros must be a non-negative integer string, got ${JSON.stringify(input.amountMicros)}`);
  }
  return {
    kind: input.kind,
    wallet: input.wallet.toLowerCase(),
    amountMicros: input.amountMicros,
    // EVM addresses compare in lower case; Solana addresses are case-sensitive.
    recipient: input.recipient && /^0x/i.test(input.recipient) ? input.recipient.toLowerCase() : (input.recipient ?? null),
    detail: { ...(input.detail ?? {}) },
  };
}

export function actionDigest(action: PresenceAction, chainId: number): `0x${string}` {
  const a = presenceAction(action);
  const detail = Object.entries(a.detail).sort(([x], [y]) => (x < y ? -1 : x > y ? 1 : 0));
  const input = `karwan:confirm:v1:${chainId}:${JSON.stringify([a.kind, a.wallet, a.amountMicros, a.recipient, detail])}`;
  return `0x${createHash('sha256').update(input).digest('hex')}`;
}

export function formatUsdc(micros: string): string {
  const whole = micros.length > 6 ? micros.slice(0, -6) : '0';
  const fraction = micros.padStart(6, '0').slice(-6).replace(/0+$/, '');
  return fraction ? `${whole}.${fraction}` : whole;
}

/// What a web3 wallet signs, and the plain record of what was confirmed.
export function actionText(action: PresenceAction, chainId: number): string {
  const a = presenceAction(action);
  const lines = ['Karwan confirmation', KIND_WORDS[a.kind]];
  if (a.amountMicros !== null) lines.push(`Amount: ${formatUsdc(a.amountMicros)} USDC`);
  if (a.recipient) lines.push(`To: ${a.recipient}`);
  lines.push(`Network: ${chainId === 5042 ? 'Arc' : 'Arc testnet'}`);
  lines.push(`Code: ${actionDigest(a, chainId)}`);
  return lines.join('\n');
}
