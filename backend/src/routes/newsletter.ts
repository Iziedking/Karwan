import { Hono } from 'hono';
import { z } from 'zod';
import { rateLimit } from '../middleware/rateLimit.js';
import { subscribeToNewsletter } from '../emails/audienceSync.js';
import { sendNewsletterWelcome } from '../emails/newsletterWelcome.js';

export const newsletterRoutes = new Hono();

const subscribeSchema = z.object({
  email: z.string().trim().toLowerCase().email('enter a valid email').max(200),
});

/// Public newsletter opt-in driven by the footer subscribe box. Anyone (signed
/// in or not) can subscribe with an email. This is a marketing list separate
/// from a user's verified contact email; unsubscribing later (via Resend's
/// hosted unsubscribe link in each broadcast) only flips the audience contact
/// and never touches the verified-email list. Rate-limited so the open endpoint
/// can't be used to spam the audience.
newsletterRoutes.post(
  '/subscribe',
  rateLimit({ windowMs: 60 * 60 * 1000, max: 20, name: 'newsletter-subscribe' }),
  async (c) => {
    let body;
    try {
      body = subscribeSchema.parse(await c.req.json());
    } catch (err) {
      return c.json({ error: 'invalid email', detail: (err as Error).message }, 400);
    }
    const result = await subscribeToNewsletter(body.email);
    if (!result.ok) {
      return c.json({ error: 'could not subscribe, try again later' }, 502);
    }
    // Fire the "you're on the list" confirmation without blocking the response;
    // a send failure never fails the subscribe (the contact is already stored).
    void sendNewsletterWelcome(body.email);
    return c.json({ ok: true });
  },
);
