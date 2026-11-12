import type { AdminDeskMe, AdminSignInAnswer } from '@/core/api';

/// The desk's sign-in, step by step (view 79): the password, then on mainnet
/// the authenticator code, or on a first mainnet sign-in setting the code up.

export type SignInState =
  | { step: 'password'; error: string | null }
  | { step: 'code'; ticket: string; error: string | null }
  | { step: 'setup'; ticket: string; otpauth: string; error: string | null }
  | { step: 'done'; me: AdminDeskMe; error: null };

export type SignInEvent =
  | { kind: 'answer'; body: AdminSignInAnswer }
  | { kind: 'signed-in'; me: AdminDeskMe }
  | { kind: 'error'; status: number; message: string }
  | { kind: 'restart' };

export const START: SignInState = { step: 'password', error: null };

/// The server's line when a ticket ran out: the password comes first again.
const TICKET_GONE = 'Sign in again.';

export function nextSignInStep(state: SignInState, event: SignInEvent): SignInState {
  switch (event.kind) {
    case 'restart':
      return START;
    case 'signed-in':
      return { step: 'done', me: event.me, error: null };
    case 'answer': {
      const b = event.body;
      if (b.step === 'code') return { step: 'code', ticket: b.ticket, error: null };
      if (b.step === 'setup') return { step: 'setup', ticket: b.ticket, otpauth: b.otpauth, error: null };
      return { step: 'done', me: b.me, error: null };
    }
    case 'error':
      if (state.step === 'done') return state;
      if (state.step !== 'password' && event.status === 401 && event.message === TICKET_GONE) return { step: 'password', error: TICKET_GONE };
      return { ...state, error: event.message };
  }
}
