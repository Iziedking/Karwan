/// The email proof from the code step, held in memory until the passkey
/// account signs in. Never stored: a reload means confirming the email again.
let pending: string | null = null;

export function holdEmailProof(proof: string): void {
  pending = proof;
}

export function peekEmailProof(): string | null {
  return pending;
}

export function clearEmailProof(): void {
  pending = null;
}
