import { z } from 'zod';

/// Settings for the CRE suite module. Kept beside the module rather than in
/// config.ts until the suite is wired into the deal flow (plan 8).
const flag = z.preprocess((v) => ['true', '1', 'yes', 'on'].includes(String(v ?? '').trim().toLowerCase()), z.boolean());
const optional = z.preprocess((v) => (v === undefined || v === '' ? undefined : v), z.string().optional());
const address = z.preprocess((v) => (v === undefined || v === '' ? undefined : v), z.string().regex(/^0x[0-9a-fA-F]{40}$/).optional());

const schema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  CRE_SUITE_ENABLED: flag,
  /// Off until Chainlink's hosted network runs the workflows end to end; while
  /// off, deals name V-K and Karwan's own checks decide (owner rule, 15 October).
  CRE_ENABLED: flag,
  CRE_FALLBACK_AFTER_MS: z.coerce.number().int().min(600_000).max(7 * 86_400_000).default(3_600_000),
  CRE_WORKFLOW_TOKEN: optional,
  CRE_GATEWAY_SIGNER_KEY: optional,
  CRE_GATEWAY_URL: z.string().url().default('https://01.gateway.zone-a.cre.chain.link'),
  CRE_CHECK_WORKFLOW_ID: optional,
  CRE_RECORD_WORKFLOW_ID: optional,
  CRE_RISK_WORKFLOW_ID: optional,
  CRE_WORKFLOW_IDS: z.preprocess((v) => String(v ?? '').split(',').map((s) => s.trim()).filter(Boolean), z.array(z.string())),
  CRE_WORKFLOW_OWNER: optional,
  CRE_REGISTRY_RPC_URL: optional,
  CRE_REPORT_TRUST: z.enum(['verified', 'simulation']).default('verified'),
  CRE_ADAPTER_ADDR: address,
  CRE_VERIFIER_K_ADDR: address,
  CRE_VERIFIER_CK_ADDR: address,
  CRE_ARC_RPC_URL: optional,
  CRE_IDENTITY_ADDR: address,
  /// KarwanCreFees: holds dry-run payments until a signed answer or a refund.
  CRE_FEES_ADDR: address,
  /// Pays Arc gas to relay fee payments; it can move no one's money.
  CRE_RELAYER_KEY: z.preprocess((v) => (v === undefined || v === '' ? undefined : v), z.string().regex(/^0x[0-9a-fA-F]{64}$/).optional()),
}).refine((s) => !(s.CRE_REPORT_TRUST === 'simulation' && s.NODE_ENV === 'production'), {
  message: 'CRE_REPORT_TRUST=simulation is refused in production',
});

export interface CreSettings {
  production: boolean;
  suiteEnabled: boolean;
  creEnabled: boolean;
  fallbackAfterMs: number;
  workflowToken?: string;
  gatewaySignerKey?: string;
  gatewayUrl: string;
  checkWorkflowId?: string;
  recordWorkflowId?: string;
  riskWorkflowId?: string;
  workflowIds: string[];
  workflowOwner?: string;
  registryRpcUrl?: string;
  reportTrust: 'verified' | 'simulation';
  adapter?: string;
  verifierK?: string;
  verifierCK?: string;
  arcRpcUrl?: string;
  identity?: string;
  fees?: string;
  relayerKey?: string;
}

export function parseCreSettings(env: Record<string, string | undefined>): CreSettings {
  const s = schema.parse(env);
  return {
    production: s.NODE_ENV === 'production',
    suiteEnabled: s.CRE_SUITE_ENABLED,
    creEnabled: s.CRE_ENABLED,
    fallbackAfterMs: s.CRE_FALLBACK_AFTER_MS,
    workflowToken: s.CRE_WORKFLOW_TOKEN,
    gatewaySignerKey: s.CRE_GATEWAY_SIGNER_KEY,
    gatewayUrl: s.CRE_GATEWAY_URL,
    checkWorkflowId: s.CRE_CHECK_WORKFLOW_ID,
    recordWorkflowId: s.CRE_RECORD_WORKFLOW_ID,
    riskWorkflowId: s.CRE_RISK_WORKFLOW_ID,
    workflowIds: s.CRE_WORKFLOW_IDS,
    workflowOwner: s.CRE_WORKFLOW_OWNER,
    registryRpcUrl: s.CRE_REGISTRY_RPC_URL,
    reportTrust: s.CRE_REPORT_TRUST,
    adapter: s.CRE_ADAPTER_ADDR,
    verifierK: s.CRE_VERIFIER_K_ADDR,
    verifierCK: s.CRE_VERIFIER_CK_ADDR,
    arcRpcUrl: s.CRE_ARC_RPC_URL,
    identity: s.CRE_IDENTITY_ADDR,
    fees: s.CRE_FEES_ADDR,
    relayerKey: s.CRE_RELAYER_KEY,
  };
}
