import { ARC_NETWORK } from '@/core/arcNetwork';

/// Passkey recovery exists for mainnet passkey wallets only, behind a flag
/// until the release checks pass.
export const RECOVERY_ON = process.env.NEXT_PUBLIC_RECOVERY === '1' && ARC_NETWORK === 'mainnet';
