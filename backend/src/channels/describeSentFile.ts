import { generateObject } from 'ai';
import { z } from 'zod';
import { assistantAgentModel } from '../llm/client.js';
import { withLlmTimeout } from '../agents/llm-utils.js';
import type { SentFileReading, SentType } from './sentFiles.js';

const readingSchema = z.object({
  kind: z.enum(['item', 'parcel', 'document', 'screenshot', 'other']),
  shows: z.string().max(400),
});

/// Reads once what a sent photo or PDF shows (view 66), with the model that
/// reads invoices. It describes; it decides nothing. A failed read returns
/// null and the assistant asks instead.
export async function describeSentFile(bytes: Uint8Array, mimeType: SentType): Promise<SentFileReading | null> {
  if (!assistantAgentModel) return null;
  const file =
    mimeType === 'application/pdf'
      ? { type: 'file' as const, data: bytes, mediaType: mimeType }
      : { type: 'image' as const, image: bytes, mediaType: mimeType };
  try {
    const { object } = await withLlmTimeout(
      'channels.describe-sent-file',
      generateObject({
        model: assistantAgentModel,
        schema: readingSchema,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text:
                  'Someone sent this to a marketplace assistant. Say in one or two plain sentences what it shows: the item with its make, ' +
                  'model, colour and condition when you can see them, or for a document what kind it is, who issued it, to whom, the total and the date. ' +
                  'Kind: item (something for sale or bought), parcel (packed or handed over goods), document (an invoice, receipt, quote or contract), ' +
                  'screenshot, or other. Describe only what is visible. Do not guess, and never copy account numbers, card numbers or codes.',
              },
              file,
            ],
          },
        ],
        maxOutputTokens: 200,
      }),
      20_000,
    );
    return { kind: object.kind, shows: object.shows.trim() };
  } catch {
    return null;
  }
}
