import assert from 'node:assert/strict';
import { createHash, generateKeyPairSync, randomBytes, sign, type KeyObject } from 'node:crypto';
import test from 'node:test';
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type RegistrationResponseJSON,
} from '@simplewebauthn/server';

/// A software P-256 passkey that signs real WebAuthn assertions, so the
/// confirmation tests run through @simplewebauthn's own checks.
export interface SoftPasskey {
  credentialId: string;
  /// COSE public key, base64url, the way Karwan stores passkeys.
  publicKey: string;
  assert: (input: { challenge: string; origin: string; rpID: string; userVerified?: boolean; counter?: number }) => AuthenticationResponseJSON;
  /// A "none" attestation, as a phone's platform passkey sends when it is created.
  register: (input: { challenge: string; origin: string; rpID: string; userVerified?: boolean }) => RegistrationResponseJSON;
}

const sha256 = (b: Buffer | string) => createHash('sha256').update(b).digest();

function coseKey(publicKey: KeyObject): Buffer {
  const jwk = publicKey.export({ format: 'jwk' });
  const x = Buffer.from(jwk.x!, 'base64url');
  const y = Buffer.from(jwk.y!, 'base64url');
  // {1: 2 (EC2), 3: -7 (ES256), -1: 1 (P-256), -2: x, -3: y}
  return Buffer.concat([Buffer.from([0xa5, 0x01, 0x02, 0x03, 0x26, 0x20, 0x01, 0x21, 0x58, 0x20]), x, Buffer.from([0x22, 0x58, 0x20]), y]);
}

function cborText(text: string): Buffer {
  return Buffer.concat([Buffer.from([0x60 + text.length]), Buffer.from(text)]);
}

export function softPasskey(): SoftPasskey {
  const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const rawId = randomBytes(16);
  const credentialId = rawId.toString('base64url');
  const cose = coseKey(publicKey);
  return {
    credentialId,
    publicKey: cose.toString('base64url'),
    register: ({ challenge, origin, rpID, userVerified = true }) => {
      const clientDataJSON = Buffer.from(JSON.stringify({ type: 'webauthn.create', challenge, origin, crossOrigin: false }));
      const flags = 0x01 | (userVerified ? 0x04 : 0) | 0x40;
      const idLength = Buffer.alloc(2);
      idLength.writeUInt16BE(rawId.length);
      const authData = Buffer.concat([sha256(rpID), Buffer.from([flags]), Buffer.alloc(4), Buffer.alloc(16), idLength, rawId, cose]);
      const authLength = Buffer.alloc(2);
      authLength.writeUInt16BE(authData.length);
      const attestationObject = Buffer.concat([
        Buffer.from([0xa3]),
        cborText('fmt'), cborText('none'),
        cborText('attStmt'), Buffer.from([0xa0]),
        cborText('authData'), Buffer.from([0x59]), authLength, authData,
      ]);
      return {
        id: credentialId,
        rawId: credentialId,
        type: 'public-key',
        clientExtensionResults: {},
        response: {
          clientDataJSON: clientDataJSON.toString('base64url'),
          attestationObject: attestationObject.toString('base64url'),
          transports: ['internal'],
        },
      };
    },
    assert: ({ challenge, origin, rpID, userVerified = true, counter = 1 }) => {
      const clientDataJSON = Buffer.from(JSON.stringify({ type: 'webauthn.get', challenge, origin, crossOrigin: false }));
      const flags = 0x01 | (userVerified ? 0x04 : 0);
      const count = Buffer.alloc(4);
      count.writeUInt32BE(counter);
      const authenticatorData = Buffer.concat([sha256(rpID), Buffer.from([flags]), count]);
      const signature = sign('sha256', Buffer.concat([authenticatorData, sha256(clientDataJSON)]), privateKey);
      return {
        id: credentialId,
        rawId: credentialId,
        type: 'public-key',
        clientExtensionResults: {},
        response: {
          clientDataJSON: clientDataJSON.toString('base64url'),
          authenticatorData: authenticatorData.toString('base64url'),
          signature: signature.toString('base64url'),
        },
      };
    },
  };
}

test('the soft passkey signs an assertion simplewebauthn accepts', async () => {
  const key = softPasskey();
  const rpID = 'localhost';
  const origin = 'http://localhost:3000';
  const options = await generateAuthenticationOptions({ rpID, userVerification: 'required', challenge: randomBytes(32) });
  const verification = await verifyAuthenticationResponse({
    response: key.assert({ challenge: options.challenge, origin, rpID, counter: 3 }),
    expectedChallenge: options.challenge,
    expectedOrigin: origin,
    expectedRPID: rpID,
    requireUserVerification: true,
    credential: { id: key.credentialId, publicKey: new Uint8Array(Buffer.from(key.publicKey, 'base64url')), counter: 0 },
  });
  assert.equal(verification.verified, true);
  assert.equal(verification.authenticationInfo.newCounter, 3);
});

test('the soft passkey registers with a none attestation simplewebauthn accepts', async () => {
  const key = softPasskey();
  const rpID = 'localhost';
  const origin = 'http://localhost:3000';
  const options = await generateRegistrationOptions({ rpName: 'Karwan', rpID, userName: 'a', attestationType: 'none', authenticatorSelection: { userVerification: 'required' } });
  const verification = await verifyRegistrationResponse({
    response: key.register({ challenge: options.challenge, origin, rpID }),
    expectedChallenge: options.challenge,
    expectedOrigin: origin,
    expectedRPID: rpID,
    requireUserVerification: true,
  });
  assert.equal(verification.verified, true);
  assert.equal(verification.registrationInfo?.credential.id, key.credentialId);
  assert.equal(Buffer.from(verification.registrationInfo!.credential.publicKey).toString('base64url'), key.publicKey);
});
