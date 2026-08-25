import type { EvidenceClaim, EvidenceProvider, EvidenceNeed } from './planner.js';

export type ProviderCircuitState = 'closed' | 'open' | 'half_open';

export interface EvidenceProviderRegistration extends EvidenceProvider {
  providerVersion: string;
  claims: readonly EvidenceClaim[];
  provenanceRequirements: readonly string[];
  enabled: boolean;
  circuit: {
    state: ProviderCircuitState;
    consecutiveFailures: number;
    openedAtUnix?: number;
    cooldownSeconds: number;
    failureThreshold: number;
  };
}

export interface ProviderCircuitObservation {
  success: boolean;
  nowUnix: number;
}

export type ProviderSelection =
  | { allowed: true; provider: EvidenceProviderRegistration }
  | { allowed: false; reason: 'DISABLED' | 'CLAIM_UNSUPPORTED' | 'CIRCUIT_OPEN' | 'PROVENANCE_UNSUPPORTED' };

function circuitAvailable(
  circuit: EvidenceProviderRegistration['circuit'],
  nowUnix: number,
): boolean {
  if (circuit.state === 'closed') return true;
  if (circuit.state === 'half_open') return true;
  if (circuit.openedAtUnix === undefined) return false;
  return nowUnix >= circuit.openedAtUnix + circuit.cooldownSeconds;
}

/**
 * Applies a provider result without mutating the input registration. A
 * successful half-open probe closes the circuit; failures open it only after
 * the configured threshold. This state is audit input, never purchase
 * authority by itself.
 */
export function applyProviderCircuitObservation(
  registration: EvidenceProviderRegistration,
  observation: ProviderCircuitObservation,
): EvidenceProviderRegistration {
  const { circuit } = registration;
  if (observation.success) {
    return {
      ...registration,
      circuit: {
        ...circuit,
        state: 'closed',
        consecutiveFailures: 0,
        openedAtUnix: undefined,
      },
    };
  }
  const consecutiveFailures = circuit.consecutiveFailures + 1;
  const opens = consecutiveFailures >= circuit.failureThreshold;
  return {
    ...registration,
    circuit: {
      ...circuit,
      state: opens ? 'open' : circuit.state === 'open' ? 'open' : 'closed',
      consecutiveFailures,
      ...(opens ? { openedAtUnix: observation.nowUnix } : {}),
    },
  };
}

export function selectRegisteredProvider(
  registration: EvidenceProviderRegistration,
  need: EvidenceNeed,
  nowUnix: number,
  requiredProvenance: readonly string[] = [],
): ProviderSelection {
  if (!registration.enabled) return { allowed: false, reason: 'DISABLED' };
  if (!registration.claims.includes(need.claim)) return { allowed: false, reason: 'CLAIM_UNSUPPORTED' };
  if (!circuitAvailable(registration.circuit, nowUnix)) return { allowed: false, reason: 'CIRCUIT_OPEN' };
  if (requiredProvenance.some((value) => !registration.provenanceRequirements.includes(value))) {
    return { allowed: false, reason: 'PROVENANCE_UNSUPPORTED' };
  }
  return { allowed: true, provider: registration };
}

export function providerCircuitIsAvailable(
  registration: EvidenceProviderRegistration,
  nowUnix: number,
): boolean {
  return registration.enabled && circuitAvailable(registration.circuit, nowUnix);
}
