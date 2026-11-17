import type { PassSettings } from './anthropicPass.js';

/// How the server reaches Claude at Anthropic (view 89), decided once at
/// start: a pass when the rule and the organization are set, else the key,
/// else not at all. The pass wins over a key left in place during the move.

export type AnthropicAuth =
  | { kind: 'pass'; settings: PassSettings; region: string }
  | { kind: 'key'; apiKey: string }
  | null;

export interface AnthropicAuthEnv {
  ruleId?: string;
  organizationId?: string;
  workspaceId?: string;
  serviceAccountId?: string;
  stsRegion?: string;
  awsRegion?: string;
  apiKey?: string;
}

export function anthropicAuthFrom(env: AnthropicAuthEnv): AnthropicAuth {
  if (env.ruleId && env.organizationId) {
    const settings: PassSettings = { ruleId: env.ruleId, organizationId: env.organizationId };
    if (env.workspaceId) settings.workspaceId = env.workspaceId;
    if (env.serviceAccountId) settings.serviceAccountId = env.serviceAccountId;
    return { kind: 'pass', settings, region: env.stsRegion ?? env.awsRegion ?? 'us-east-1' };
  }
  if (env.apiKey) return { kind: 'key', apiKey: env.apiKey };
  return null;
}
