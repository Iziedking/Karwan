/// Single Resend client used by every transactional sender (OTP, invite,
/// future deal/dispute notifications). Lazy-init so a misconfigured key only
/// surfaces when someone actually tries to send.
import { Resend } from 'resend';
import { config } from '../config.js';

let _resend: Resend | null | undefined;

export function resendClient(): Resend | null {
  if (_resend !== undefined) return _resend;
  _resend = config.RESEND_API_KEY ? new Resend(config.RESEND_API_KEY) : null;
  return _resend;
}
