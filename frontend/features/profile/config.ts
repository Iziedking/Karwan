import { arcTestnet } from '@/core/wagmi';

// USDC on Arc Testnet is the native gas asset (18 decimals). Funding an agent
// is a plain native value transfer: the recipient's native balance is exactly
// what the app and backend read as the agent's USDC balance. This avoids the
// dual-interface decimal ambiguity of calling ERC-20 transfer on the system
// contract, which interprets amounts at 18-decimal precision.
export const ARC_NATIVE_DECIMALS = 18;

export const ARC_CHAIN_ID = arcTestnet.id;

export const ARC_EXPLORER_TX = (h: string) => `https://testnet.arcscan.app/tx/${h}`;
