import { tool } from 'ai';
import { z } from 'zod';
import { getProfile } from '../db/profiles.js';
import { logger } from '../logger.js';
import { factsFor } from '../verification/evidence.js';
import { isDiscoverable, ladderFor, nextSteps } from '../verification/ladder.js';
import { evidenceDeps } from '../verification/live.js';
import { verificationServices } from '../verification/services.js';
import { openLinkFor } from '../whatsapp/sender.js';

/// Getting verified, from chat or the app. The level and the missing steps
/// come from the published rules; the model only explains them.
export function verificationTools(address: string) {
  return {
    my_verification: tool({
      description:
        "The user's verification level (registered, person verified, work verified, ID verified), whether other agents can find them, and exactly which steps are missing, in order. Use for 'am I verified', 'how do I get found', 'what do I need to do'.",
      inputSchema: z.object({}),
      execute: async () => {
        const now = Date.now();
        const facts = await factsFor(address, evidenceDeps, now);
        const level = ladderFor(facts, now);
        return { level, discoverable: isDiscoverable(level), missing: nextSteps(facts, now) };
      },
    }),

    open_verification_step: tool({
      description:
        "Give the user the link for a verification step that happens on a page: 'person_check' (World ID, proves they are one real person) or 'link_x' (sign in with X to prove the account is theirs). For a WhatsApp user it is a one-time sign-in link valid for 10 minutes.",
      inputSchema: z.object({ step: z.enum(['person_check', 'link_x']) }),
      execute: async ({ step }) => {
        const path = step === 'person_check' ? '/verify/person' : '/profile';
        const link = await openLinkFor(address, path);
        return link ? { ok: true, link, validMinutes: 10 } : { ok: true, path };
      },
    }),

    ask_past_client_to_confirm: tool({
      description:
        "Ask a past client, by their WhatsApp number, to confirm one job the user did for them. The client gets one message with Yes and No. Set aboutLatestInvoice when the user just sent an invoice for that client, so a Yes also backs the invoice. Never call it without the user giving the client's number.",
      inputSchema: z.object({
        clientWhatsapp: z.string().min(7).max(20).describe('With country code, for example +2348012345678.'),
        job: z.string().min(2).max(120).describe('What was done, in a few words, as the client would recognise it.'),
        month: z.string().min(3).max(40).describe('Roughly when, for example "March 2026".'),
        aboutLatestInvoice: z.boolean().optional(),
      }),
      execute: async ({ clientWhatsapp, job, month, aboutLatestInvoice }) => {
        const services = verificationServices();
        if (!services) return { error: 'Client confirmations are not available right now.' };
        try {
          const name = (await getProfile(address))?.displayName || 'A Karwan user';
          let invoiceFactId: string | undefined;
          if (aboutLatestInvoice) {
            const stored = await evidenceDeps.getStored(address.toLowerCase());
            invoiceFactId = stored.filter((f) => f.kind === 'invoice' && !f.corroborated).at(-1)?.id;
          }
          const r = await services.clientConfirm.request({ subject: address, subjectName: name, clientNumber: clientWhatsapp, job, month, invoiceFactId });
          if (!r.ok) {
            return {
              error:
                r.reason === 'own_number'
                  ? 'That is your own number. A past client has to confirm.'
                  : 'This client has already confirmed three jobs for you. Ask a different client.',
            };
          }
          return { ok: true, sent: true, note: 'They get one message with Yes and No. You will see it on your record when they answer.' };
        } catch (err) {
          logger.warn({ err: (err as Error).message }, 'assistant ask_past_client_to_confirm failed');
          return { error: 'Could not send that request right now.' };
        }
      },
    }),

    submit_business_registration: tool({
      description:
        "Send the user's CAC business registration (RC or BN number and the registered name) for review. A reviewer checks it against the public register; the user is told the result in chat.",
      inputSchema: z.object({
        rc: z.string().min(4).max(32),
        registeredName: z.string().min(2).max(120),
      }),
      execute: async ({ rc, registeredName }) => {
        const services = verificationServices();
        if (!services) return { error: 'Business registration checks are not available right now.' };
        const r = await services.cac.submit(address, rc, registeredName);
        if (!r.ok) return { error: 'That is not an RC or BN number.' };
        return { ok: true, status: 'waiting for review' };
      },
    }),
  };
}
