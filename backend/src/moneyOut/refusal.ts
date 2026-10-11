import { formatUnits } from 'viem';
import { utc } from './messages.js';
import { DAILY_LIMIT_MICROS, type Refusal } from './rules.js';

export interface RefusalBody {
  code: `MONEY_OUT_${Refusal['code']}`;
  /// One sentence the chat agent can say as it is. The web maps the code.
  error: string;
  opensAt?: number;
  limitUsdc?: string;
  leftUsdc?: string;
  moreAt?: number;
}

const usdc = (micros: bigint) => formatUnits(micros, 6);

/// The 409 every exit answers when the guard says no.
export function refusalBody(r: Refusal): RefusalBody {
  const code = `MONEY_OUT_${r.code}` as const;
  switch (r.code) {
    case 'NO_SESSION':
      return { code, error: 'Link your World ID with the person check before money can leave your account.' };
    case 'PAUSED':
      return { code, error: 'Payments out of your account are paused. Confirm with your World ID to resume them.' };
    case 'RETURN_CHECK':
      return { code, error: 'Welcome back. Confirm with your World ID before money moves.' };
    case 'ADDRESS_NOT_SAVED':
      return { code, error: 'Add this address with your World ID first. It can receive money 24 hours later.' };
    case 'ADDRESS_OPENS_LATER':
      return { code, error: `This address can receive money from ${utc(r.opensAt)}.`, opensAt: r.opensAt };
    case 'DAILY_LIMIT':
      return {
        code,
        error:
          `Up to ${usdc(DAILY_LIMIT_MICROS)} USDC can leave your account in 24 hours. ` +
          `${usdc(r.leftMicros)} USDC can leave now, and more from ${utc(r.moreAt)}.`,
        limitUsdc: usdc(DAILY_LIMIT_MICROS),
        leftUsdc: usdc(r.leftMicros),
        moreAt: r.moreAt,
      };
    case 'OWN_WALLET_ONLY':
      return { code, error: 'Your Karwan wallets pay out to your own wallet. Send from there to anyone else.' };
  }
}
