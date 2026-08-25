export interface LegacyResearchCreditRecord {
  owner: string;
  active: boolean;
  creditUsdc: number;
  updatedAt: number;
}

export interface LedgerResearchCreditRecord {
  owner: string;
  balanceMicros: string;
  reservedMicros: string;
  version: number;
  updatedAt: number;
}

export type ResearchCreditBootstrapAction =
  | 'legacy-inactive'
  | 'bootstrap-required'
  | 'ledger-aligned'
  | 'review-required';

export interface ResearchCreditBootstrapPlan {
  owner: string;
  action: ResearchCreditBootstrapAction;
  reason:
    | 'LEGACY_INACTIVE'
    | 'LEGACY_PROFILE_MISSING'
    | 'INVALID_LEGACY_CREDIT'
    | 'LEGACY_STATE_INCONSISTENT'
    | 'LEDGER_ACCOUNT_MISSING'
    | 'LEDGER_HAS_RESERVED_CREDIT'
    | 'LEGACY_LEDGER_MISMATCH'
    | 'ALIGNED_READ_ONLY';
  legacyActive: boolean;
  legacyCreditMicros: string;
  ledgerBalanceMicros?: string;
  ledgerReservedMicros?: string;
  ledgerVersion?: number;
  legacyUpdatedAt?: number;
  ledgerUpdatedAt?: number;
}

function ownerKey(owner: string): string {
  const value = owner.trim();
  return /^0x[0-9a-f]{40}$/i.test(value) ? value.toLowerCase() : value;
}

function legacyCreditMicros(value: number): { valid: true; micros: string } | { valid: false; micros: '0' } {
  if (!Number.isFinite(value) || value < 0) return { valid: false, micros: '0' };
  // Legacy profile credit is a number rounded to six decimals at write time.
  // Preserve that existing representation while making the comparison exact.
  const micros = Math.round(value * 1_000_000);
  if (!Number.isSafeInteger(micros)) return { valid: false, micros: '0' };
  return { valid: true, micros: micros.toString() };
}

function ledgerMicros(value: string): bigint | null {
  try {
    if (!/^\d+$/.test(value)) return null;
    return BigInt(value);
  } catch {
    return null;
  }
}

export function planResearchCreditBootstrap(input: {
  owner: string;
  legacy?: LegacyResearchCreditRecord;
  ledger?: LedgerResearchCreditRecord;
}): ResearchCreditBootstrapPlan {
  const owner = ownerKey(input.owner);
  const legacyValue = input.legacy ? legacyCreditMicros(input.legacy.creditUsdc) : { valid: true as const, micros: '0' };
  const base = {
    owner,
    legacyActive: input.legacy?.active === true,
    legacyCreditMicros: legacyValue.micros,
    ...(input.legacy ? { legacyUpdatedAt: input.legacy.updatedAt } : {}),
    ...(input.ledger ? {
      ledgerBalanceMicros: input.ledger.balanceMicros,
      ledgerReservedMicros: input.ledger.reservedMicros,
      ledgerVersion: input.ledger.version,
      ledgerUpdatedAt: input.ledger.updatedAt,
    } : {}),
  } satisfies Omit<ResearchCreditBootstrapPlan, 'action' | 'reason'>;

  if (!input.legacy) return { ...base, action: 'review-required', reason: 'LEGACY_PROFILE_MISSING' };
  if (!legacyValue.valid) return { ...base, action: 'review-required', reason: 'INVALID_LEGACY_CREDIT' };
  if (!input.legacy.active && legacyValue.micros !== '0') {
    return { ...base, action: 'review-required', reason: 'LEGACY_STATE_INCONSISTENT' };
  }
  if (!input.legacy.active || legacyValue.micros === '0') {
    if (!input.ledger || (ledgerMicros(input.ledger.balanceMicros) ?? -1n) === 0n) {
      return { ...base, action: 'legacy-inactive', reason: 'LEGACY_INACTIVE' };
    }
    return { ...base, action: 'review-required', reason: 'LEGACY_LEDGER_MISMATCH' };
  }
  if (!input.ledger) return { ...base, action: 'bootstrap-required', reason: 'LEDGER_ACCOUNT_MISSING' };
  const balance = ledgerMicros(input.ledger.balanceMicros);
  const reserved = ledgerMicros(input.ledger.reservedMicros);
  if (balance === null || reserved === null || reserved > 0n) {
    return { ...base, action: 'review-required', reason: 'LEDGER_HAS_RESERVED_CREDIT' };
  }
  if (balance.toString() === legacyValue.micros && reserved === 0n) {
    return { ...base, action: 'ledger-aligned', reason: 'ALIGNED_READ_ONLY' };
  }
  return { ...base, action: 'review-required', reason: 'LEGACY_LEDGER_MISMATCH' };
}

/**
 * Keeps the legacy profile credit authoritative until an operator approves a
 * migration. This helper is intentionally a pure read-only comparison and
 * never calls ensureAccount, reserve, settle, release, or profile writes.
 */
export function legacyCreditToMicros(value: number): string {
  const parsed = legacyCreditMicros(value);
  if (!parsed.valid) throw new Error('invalid legacy research credit');
  return parsed.micros;
}
