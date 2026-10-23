import { z } from 'zod';

/// The body of POST /api/assistant/chat. `mode` says where the person is
/// typing: the Help panel, or assistant mode.
export const chatBodySchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string().min(1).max(4000),
      }),
    )
    .min(1)
    .max(40),
  mode: z.enum(['help', 'assistant']).optional(),
  /// The saved conversation this turn belongs to, so a deal sent from it can
  /// offer its payment there later (view 24).
  conversationId: z.string().min(1).max(64).optional(),
});
