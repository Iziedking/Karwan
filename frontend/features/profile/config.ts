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

// KarwanVault deployed to Arc testnet. Surfaced here so the staking UI can
// read positions + sign deposits/withdrawals without an env round-trip.
// Mirrors the backend KARWAN_VAULT_ADDR. Set to the empty string while the
// vault is being redeployed and the UI will degrade to a "not deployed" pill.
export const KARWAN_VAULT_ADDRESS = '0x92b1223921944024f6615A604a2bDA6eF1fEe922' as const;
