import { secp256k1 } from '@noble/curves/secp256k1';
import { hashMessage, hexToBytes, toHex, type Address, type Hex } from 'viem';
import { publicKeyToAddress } from 'viem/accounts';

/// CRE handlers run synchronously, and viem's recovery is async, so the
/// personal-message signer is recovered here with the same curve library.
export function recoverSigner(message: string, signature: Hex): Address | null {
  try {
    const bytes = hexToBytes(signature);
    if (bytes.length !== 65) return null;
    const v = bytes[64] >= 27 ? bytes[64] - 27 : bytes[64];
    if (v !== 0 && v !== 1) return null;
    const sig = secp256k1.Signature.fromCompact(bytes.slice(0, 64)).addRecoveryBit(v);
    const point = sig.recoverPublicKey(hexToBytes(hashMessage(message)));
    return publicKeyToAddress(toHex(point.toRawBytes(false)));
  } catch {
    return null;
  }
}
