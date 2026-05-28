import { arcTestnet } from '@/core/wagmi';

// USDC on Arc Testnet is the native gas asset (18 decimals). Funding an agent
// is a plain native value transfer: the recipient's native balance is exactly
// what the app and backend read as the agent's USDC balance. This avoids the
// dual-interface decimal ambiguity of calling ERC-20 transfer on the system
// contract, which interprets amounts at 18-decimal precision.
export const ARC_NATIVE_DECIMALS = 18;

export const ARC_CHAIN_ID = arcTestnet.id;

export const ARC_EXPLORER_TX = (h: string) => `https://testnet.arcscan.app/tx/${h}`;

// USDC ERC-20 interface on Arc. Same address Arc exposes as the native gas
// asset; vault staking moves USDC at 6-decimal ERC-20 precision, NOT the
// 18-decimal native interface. Keep this in sync with backend USDC_ADDR.
export const ARC_USDC_ADDRESS = '0x3600000000000000000000000000000000000000' as const;

// USDC at the ERC-20 interface is 6 decimals (the same scale escrow + vault use).
export const ARC_USDC_DECIMALS = 6;

// Active KarwanVault (v2.D-prime bundle, deployed 2026-05-28). Mirrors the
// backend KARWAN_VAULT_ADDR. Web3 users sign deposit / withdraw / claim
// against this. Previous v2.D vault (0xAb26...368E) is now the Gen 2 legacy.
export const KARWAN_VAULT_ADDRESS = '0x3Fe7bdDea2b1D5255a0e865222dAE00eEefC45DA' as const;

// Gen 1 legacy KarwanVault (the original pre-v2.D contract). Read-only on the
// /legacy page so existing stakers can request-withdraw / claim USDC parked
// on the older contract. Mirrors the backend KARWAN_VAULT_LEGACY_ADDR.
export const KARWAN_VAULT_LEGACY_ADDRESS = '0x92b1223921944024f6615A604a2bDA6eF1fEe922' as const;

// Gen 1 legacy KarwanEscrow. Backs the legacy deal recovery flow (refund,
// release-final, mutual cancel) on /legacy. Mirrors KARWAN_ESCROW_LEGACY_ADDR.
export const KARWAN_ESCROW_LEGACY_ADDRESS = '0xb81d9093607E460e2E4Fa971c75d9322E756b838' as const;

// Gen 2 legacy contracts. Empty string when no Gen 2 redeploy has happened
// yet; populated at the next redeploy with whatever the previous production
// addresses were. Frontend reads these from NEXT_PUBLIC_* env at build time so
// they can be updated without touching code.
export const KARWAN_VAULT_LEGACY_ADDRESS_2 =
  (process.env.NEXT_PUBLIC_KARWAN_VAULT_LEGACY_ADDRESS_2 as `0x${string}` | undefined) ?? null;
export const KARWAN_ESCROW_LEGACY_ADDRESS_2 =
  (process.env.NEXT_PUBLIC_KARWAN_ESCROW_LEGACY_ADDRESS_2 as `0x${string}` | undefined) ?? null;
