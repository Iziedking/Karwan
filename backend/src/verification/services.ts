import type { createCacReview } from './cac.js';
import type { createClientConfirm } from './clientConfirm.js';

interface VerificationServices {
  clientConfirm: ReturnType<typeof createClientConfirm>;
  cac: ReturnType<typeof createCacReview>;
  /// True when a running channel can message a client's phone number.
  sendsToNumbers: boolean;
  /// The link a person forwards to a past client, when a channel can open it.
  confirmLink?: (requestId: string) => string | null;
}

let services: VerificationServices | null = null;

/// Installed at startup by the chat channel that owns sending. Null while no
/// channel is running.
export function installVerificationServices(s: VerificationServices): void {
  services = s;
}

export function verificationServices(): VerificationServices | null {
  return services;
}
