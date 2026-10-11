import { generateObject } from 'ai';
import { z } from 'zod';
import { assistantAgentModel } from '../llm/client.js';
import type { ExtractedInvoice } from '../verification/invoice.js';

/// Files larger than this are refused before they are downloaded.
export const MEDIA_MAX_BYTES = 10 * 1024 * 1024;

const invoiceSchema = z.object({
  issuer: z.string().optional(),
  counterparty: z.string().optional(),
  amount: z.number().optional(),
  currency: z.string().optional(),
  date: z.string().optional().describe('YYYY-MM-DD'),
  number: z.string().optional(),
});

/// Reads the printed fields off an invoice photo or PDF. The model reads
/// only; the rules in verification/invoice.ts decide whether it counts.
export async function extractInvoice(bytes: Uint8Array, mimeType: string): Promise<ExtractedInvoice> {
  if (!assistantAgentModel) throw new Error('no direct model configured');
  const file =
    mimeType === 'application/pdf'
      ? { type: 'file' as const, data: bytes, mediaType: mimeType }
      : { type: 'image' as const, image: bytes, mediaType: mimeType };
  const { object } = await generateObject({
    model: assistantAgentModel,
    schema: invoiceSchema,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text:
              'Read this invoice or receipt. Return who issued it, who it was issued to, the total amount as a number, ' +
              'the currency code, the invoice date as YYYY-MM-DD and the invoice number. Leave out any field that is not printed. Do not guess.',
          },
          file,
        ],
      },
    ],
  });
  return object as ExtractedInvoice;
}
