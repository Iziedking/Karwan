/// Single Resend client used by every transactional sender (OTP, invite,
/// future deal/dispute notifications). Lazy-init so a misconfigured key only
/// surfaces when someone actually tries to send.
import { Resend } from 'resend';
import { config } from '../config.js';
import { deliverableRecipients } from './chatRecipients.js';

let _resend: Resend | null | undefined;

export function resendClient(): Resend | null {
  if (_resend !== undefined) return _resend;
  _resend = config.RESEND_API_KEY ? withoutChatRecipients(new Resend(config.RESEND_API_KEY)) : null;
  return _resend;
}

/// WhatsApp accounts are told everything in chat; their placeholder address
/// is removed here so no sender has to remember it.
function withoutChatRecipients(client: Resend): Resend {
  const send = client.emails.send.bind(client.emails);
  client.emails.send = (async (payload, options) => {
    const to = deliverableRecipients(payload.to);
    if (to.length === 0) return { data: null, error: null, headers: null };
    return send({ ...payload, to } as typeof payload, options);
  }) as typeof client.emails.send;
  return client;
}
