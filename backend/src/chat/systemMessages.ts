import { addMessage } from '../db/messages.js';

export async function addSystemMessage(input: { jobId: string; channel: 'trade' | 'financing'; channelKey: string; eventType: string; occurrenceKey: string; body: string; financingKind?: 'factoring' | 'po'; financingId?: string; ts?: number }) {
  return addMessage({ id: `system:${input.channel}:${input.channelKey}:${input.eventType}:${input.occurrenceKey}`, jobId: input.jobId, channel: input.channel, channelKey: input.channelKey, financingKind: input.financingKind, financingId: input.financingId, sender: 'system', kind: 'system', body: input.body, eventType: input.eventType, ts: input.ts ?? Date.now() });
}
