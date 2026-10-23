import { config } from '../config.js';

/// The WebAuthn relying party for sign-in passkeys and confirmation passkeys.
export function webauthnRp(): { id: string; name: string; origin: string[] } {
  const id = config.WEBAUTHN_RP_ID ?? 'localhost';
  const baseOrigin = config.WEBAUTHN_ORIGIN ?? 'http://localhost:3000';
  // Accept the apex + www variant + localhost dev origins. Mobile browsers
  // sometimes land on www.<domain> via autocomplete, and a passkey registered
  // on the apex must still validate from www and back.
  const origins = new Set<string>([baseOrigin, baseOrigin.replace(/\/$/, '')]);
  if (id !== 'localhost') {
    origins.add(`https://${id}`);
    origins.add(`https://www.${id}`);
  }
  origins.add('http://localhost:3000');
  origins.add('http://127.0.0.1:3000');
  return {
    id,
    name: config.WEBAUTHN_RP_NAME ?? 'Karwan',
    origin: Array.from(origins),
  };
}
