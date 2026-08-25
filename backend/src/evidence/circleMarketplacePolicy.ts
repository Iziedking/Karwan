/**
 * Karwan's policy boundary for Circle Agent Marketplace discovery.
 *
 * The Discovery API is authoritative for which paid x402 API resources are
 * currently listed. It is not a people, seller, buyer, or SME directory, and
 * provider output remains supplemental evidence until Karwan validates it.
 */
export const CIRCLE_DISCOVERY_ENDPOINT = 'https://api.circle.com/v2/x402/discovery/resources';
export const CIRCLE_DISCOVERY_POLICY_VERIFIED_AT = '2026-08-25';

export const CIRCLE_DISCOVERY_AUTHORITY = {
  catalogueType: 'paid-x402-api-services',
  authoritativeForServiceDiscovery: true,
  authoritativeForPeopleDirectory: false,
  authoritativeForSmeCounterpartyDirectory: false,
  providerOutputAuthority: 'supplemental_only',
} as const;

export type CircleEvidenceUseCase =
  | 'web-research'
  | 'business-evidence'
  | 'supported-chain-evidence'
  | 'counterparty-directory';

export interface CircleDiscoveryResource {
  resource: string;
  metadata?: {
    method?: string;
    provider?: { name?: string };
    siwx?: boolean;
    supportsCircleGateway?: boolean;
    supportsVanillax402?: boolean;
  };
}

interface RecommendedService {
  provider: 'Exa' | 'Serper' | 'OpenMart' | 'Voygr' | 'Allium';
  role: 'primary' | 'fallback' | 'supplemental';
  authority: 'supplemental_only';
  resources: readonly string[];
}

export const CIRCLE_SERVICE_RECOMMENDATIONS: readonly RecommendedService[] = [
  {
    provider: 'Exa',
    role: 'primary',
    authority: 'supplemental_only',
    resources: ['https://api.exa.ai/search', 'https://api.exa.ai/contents'],
  },
  {
    provider: 'Serper',
    role: 'fallback',
    authority: 'supplemental_only',
    resources: ['https://np.orthogonal.com/serper/search'],
  },
  {
    provider: 'OpenMart',
    role: 'supplemental',
    authority: 'supplemental_only',
    resources: [
      'https://np.orthogonal.com/openmart/api/v1/search',
      'https://np.orthogonal.com/openmart/api/v1/enrich_company',
      'https://np.orthogonal.com/openmart/api/v1/business_records/list/{id_type}',
    ],
  },
  {
    provider: 'Voygr',
    role: 'supplemental',
    authority: 'supplemental_only',
    resources: ['https://np.orthogonal.com/voygr/v1/business-status'],
  },
  {
    provider: 'Allium',
    role: 'supplemental',
    authority: 'supplemental_only',
    resources: [
      'https://agents.allium.so/api/v1/developer/wallet/transactions',
      'https://agents.allium.so/api/v1/developer/wallet/balances',
    ],
  },
] as const;

export type CircleServiceSelection =
  | {
    allowed: true;
    provider: RecommendedService['provider'];
    role: RecommendedService['role'];
    authority: 'supplemental_only';
    resource: CircleDiscoveryResource;
  }
  | {
    allowed: false;
    reason:
      | 'COUNTERPARTY_DIRECTORY_OUT_OF_SCOPE'
      | 'SUPPORTED_CHAIN_NOT_VERIFIED'
      | 'NO_RECOMMENDED_LIVE_RESOURCE';
  };

function normalizeResource(value: string): string {
  try {
    const url = new URL(value);
    url.hash = '';
    return url.toString().replace(/\/$/, '');
  } catch {
    return '';
  }
}

function resourceMatches(candidate: CircleDiscoveryResource, expected: string): boolean {
  const resource = normalizeResource(candidate.resource);
  const allowed = normalizeResource(expected);
  if (!resource || !allowed || resource !== allowed) return false;
  return candidate.metadata?.siwx !== true;
}

function findResource(
  resources: readonly CircleDiscoveryResource[],
  provider: RecommendedService['provider'],
): CircleServiceSelection | null {
  const recommendation = CIRCLE_SERVICE_RECOMMENDATIONS.find((item) => item.provider === provider);
  if (!recommendation) return null;
  for (const expected of recommendation.resources) {
    const match = resources.find((candidate) => resourceMatches(candidate, expected));
    if (match) {
      return {
        allowed: true,
        provider,
        role: recommendation.role,
        authority: recommendation.authority,
        resource: match,
      };
    }
  }
  return null;
}

/**
 * Selects only from a fresh Discovery API response. This function never makes
 * or authorizes a paid request; the existing evidence budget, mandate, and
 * x402 reconciliation gates still decide whether a purchase may occur.
 */
export function selectCircleMarketplaceService(input: {
  useCase: CircleEvidenceUseCase;
  resources: readonly CircleDiscoveryResource[];
  subjectChainSupportedByProvider?: boolean;
}): CircleServiceSelection {
  if (input.useCase === 'counterparty-directory') {
    return { allowed: false, reason: 'COUNTERPARTY_DIRECTORY_OUT_OF_SCOPE' };
  }
  if (input.useCase === 'web-research') {
    return findResource(input.resources, 'Exa')
      ?? findResource(input.resources, 'Serper')
      ?? { allowed: false, reason: 'NO_RECOMMENDED_LIVE_RESOURCE' };
  }
  if (input.useCase === 'business-evidence') {
    return findResource(input.resources, 'OpenMart')
      ?? findResource(input.resources, 'Voygr')
      ?? { allowed: false, reason: 'NO_RECOMMENDED_LIVE_RESOURCE' };
  }
  if (input.subjectChainSupportedByProvider !== true) {
    return { allowed: false, reason: 'SUPPORTED_CHAIN_NOT_VERIFIED' };
  }
  return findResource(input.resources, 'Allium')
    ?? { allowed: false, reason: 'NO_RECOMMENDED_LIVE_RESOURCE' };
}
