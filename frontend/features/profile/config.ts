import { arcTestnet } from '@/core/wagmi';

// USDC on Arc Testnet — dual-interface contract:
//   native: 18 decimals (gas asset, sendTransaction value)
//   ERC-20: 6 decimals (transfer/approve at this contract address)
// We use the ERC-20 interface so the agent's 6-decimal balanceOf reflects the credit.
export const ARC_USDC_ADDRESS = '0x3600000000000000000000000000000000000000' as const;

export const ARC_USDC_DECIMALS = 6;

export const ARC_CHAIN_ID = arcTestnet.id;

export const ARC_EXPLORER_TX = (h: string) => `https://testnet.arcscan.app/tx/${h}`;
