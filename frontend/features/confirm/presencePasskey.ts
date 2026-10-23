import { startAuthentication, startRegistration } from '@simplewebauthn/browser';
import { api } from '@/core/api';

/// Confirms one challenge with a passkey: the phone's face or fingerprint check.
export async function confirmWithPasskey(challengeId: string): Promise<string> {
  const options = await api.confirmPasskeyOptions(challengeId);
  const passkey = await startAuthentication({ optionsJSON: options as unknown as Parameters<typeof startAuthentication>[0]['optionsJSON'] });
  return (await api.confirmPresence(challengeId, { passkey })).grant;
}

/// Adds a confirmation passkey on this device.
export async function addConfirmPasskey(emailCode?: string): Promise<void> {
  const options = await api.confirmPasskeyRegistrationOptions(emailCode);
  const response = await startRegistration({ optionsJSON: options as unknown as Parameters<typeof startRegistration>[0]['optionsJSON'] });
  await api.registerConfirmPasskey(response);
}
