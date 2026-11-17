import { createAnthropic } from '@ai-sdk/anthropic';
import type { AnthropicAuth } from './anthropicAuth.js';
import { passFetch, passKeeper, stsNote, type PassKeeper } from './anthropicPass.js';

/// The Claude at Anthropic link (view 89): with a pass when one is set up,
/// else with the key. The provider is given a placeholder token because
/// passFetch puts the real pass on every request.

export interface AnthropicLink {
  provider: ReturnType<typeof createAnthropic>;
  keeper: PassKeeper | null;
  how: 'pass' | 'key';
}

export function anthropicLink(auth: AnthropicAuth, deps: { keeper?: PassKeeper; fetch?: typeof fetch } = {}): AnthropicLink | null {
  if (!auth) return null;
  if (auth.kind === 'key') {
    return { provider: createAnthropic({ apiKey: auth.apiKey, fetch: deps.fetch }), keeper: null, how: 'key' };
  }
  const keeper = deps.keeper ?? passKeeper(auth.settings, { note: stsNote(auth.region) });
  return { provider: createAnthropic({ authToken: 'pass', fetch: passFetch(keeper, deps.fetch) }), keeper, how: 'pass' };
}
