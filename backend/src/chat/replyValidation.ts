import type { ChatMessage } from '../db/messages.js';

export function validateReplyTarget(
  message: ChatMessage | undefined,
  jobId: string,
  channelKey: string,
): string | null {
  if (!message || message.jobId !== jobId || message.channel !== 'financing' || message.channelKey !== channelKey) {
    return 'Replies must reference a message from the same financing conversation.';
  }
  if (message.kind !== 'participant') return 'Replies can only reference a participant message.';
  return null;
}
