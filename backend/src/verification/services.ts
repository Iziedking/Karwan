import type { createCacReview } from './cac.js';
import type { createClientConfirm } from './clientConfirm.js';

interface VerificationServices {
  clientConfirm: ReturnType<typeof createClientConfirm>;
  cac: ReturnType<typeof createCacReview>;
}

let services: VerificationServices | null = null;

/// Installed at startup by the WhatsApp agent, which owns number hashing and
/// sending. Null while the agent is off.
export function installVerificationServices(s: VerificationServices): void {
  services = s;
}

export function verificationServices(): VerificationServices | null {
  return services;
}
