import type { SystemModelMessage } from 'ai';

/// The assistant's instructions as two system messages: the part that is the
/// same for everyone, kept warm for an hour on the model's side, then the
/// lines about this person, which are never cached. Bedrock caches the
/// prefix in the order tools, system, messages, so the one cache point after
/// the fixed part covers the tools too (view 84).
export function systemMessages(fixed: string, perPerson: string): SystemModelMessage[] {
  const warm: SystemModelMessage = {
    role: 'system',
    content: fixed,
    providerOptions: {
      bedrock: { cachePoint: { type: 'default', ttl: '1h' } },
      anthropic: { cacheControl: { type: 'ephemeral', ttl: '1h' } },
    },
  };
  return perPerson ? [warm, { role: 'system', content: perPerson }] : [warm];
}
