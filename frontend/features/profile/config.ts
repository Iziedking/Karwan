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

// Active KarwanVault. Mirrors the backend KARWAN_VAULT_ADDR. Web3 users sign
// deposit / withdraw / claim against this. Env-driven so a redeploy is a Vercel
// env swap; the fallback tracks whatever is live at time of writing, currently
// the v2 bundle deployed 2026-07-25.
export const KARWAN_VAULT_ADDRESS = (process.env.NEXT_PUBLIC_KARWAN_VAULT_ADDRESS ??
  '0xA600Bd772A032Ec2b96a9A44545024E270418927') as `0x${string}`;

// KarwanYieldDistributor, per-address USDC claim contract that holds the
// daily-credited yield for stakers. Read-only on chain for balances; the
// `claim()` write is the only thing a staker ever calls.
export const KARWAN_YIELD_DISTRIBUTOR_ADDRESS =
  (process.env.NEXT_PUBLIC_KARWAN_YIELD_DISTRIBUTOR_ADDRESS ??
    '0xc9955389DDFc26d6845A581838965E015e79C420') as `0x${string}`;

// The vault the current one displaced. Read-only on /legacy so existing stakers
// can request-withdraw / claim USDC parked there. Mirrors the backend
// KARWAN_VAULT_LEGACY_ADDR. Only one generation is carried: generations older
// than this were retired at the 2026-07-25 migration.
export const KARWAN_VAULT_LEGACY_ADDRESS = '0x2d4506284B2D778365b4B295100EF099F35973c5' as const;

// The escrow the current one displaced. Backs the legacy deal recovery flow
// (refund, release-final, mutual cancel) on /legacy. Mirrors the backend
// KARWAN_ESCROW_LEGACY_ADDR.
export const KARWAN_ESCROW_LEGACY_ADDRESS = '0x48797C04EE342067A68f29Fbb19B577077d77301' as const;

// Older generations, retired at the 2026-07-25 migration. Left env-driven and
// null so /legacy renders a single generation without a code change, and so an
// address can be restored temporarily if a staker turns up with funds on one.
export const KARWAN_VAULT_LEGACY_ADDRESS_2 =
  (process.env.NEXT_PUBLIC_KARWAN_VAULT_LEGACY_ADDRESS_2 as `0x${string}` | undefined) ?? null;
export const KARWAN_ESCROW_LEGACY_ADDRESS_2 =
  (process.env.NEXT_PUBLIC_KARWAN_ESCROW_LEGACY_ADDRESS_2 as `0x${string}` | undefined) ?? null;

export const KARWAN_VAULT_LEGACY_ADDRESS_3 =
  (process.env.NEXT_PUBLIC_KARWAN_VAULT_LEGACY_ADDRESS_3 as `0x${string}` | undefined) ?? null;
export const KARWAN_ESCROW_LEGACY_ADDRESS_3 =
  (process.env.NEXT_PUBLIC_KARWAN_ESCROW_LEGACY_ADDRESS_3 as `0x${string}` | undefined) ?? null;

// SME trade-finance contracts. Env-driven so a future redeploy is a Vercel
// env swap, not a code change.
export const KARWAN_INVOICE_REGISTRY_ADDRESS =
  (process.env.NEXT_PUBLIC_KARWAN_INVOICE_REGISTRY_ADDRESS ??
    '0xFb0Debd5E2618881699ED9b02CE0c9B718a1C649') as `0x${string}`;
export const KARWAN_PO_FINANCING_ADDRESS =
  (process.env.NEXT_PUBLIC_KARWAN_PO_FINANCING_ADDRESS ??
    '0xe87ef70e19fa8bbfdc04b9310371a7006b86b60a') as `0x${string}`;

// SME Trades launch gate. The B2B rail (trade context on deals, invoice
// factoring, PO financing, the financier desk) ships behind the SME Trades
// nav slot until launch. Off by default in every environment; set
// NEXT_PUBLIC_SME_TRADES_ENABLED=1 to surface the rail for pilots and
// internal testing. P2P deal flow is unaffected either way.
export const SME_TRADES_ENABLED = process.env.NEXT_PUBLIC_SME_TRADES_ENABLED === '1';

// Market scout launch gate. The user-triggered paid market read
// (POST /api/research/scout) surfaces a "Scout the market" panel on the buyer
// surface. Off by default; set NEXT_PUBLIC_SCOUT_ENABLED=1 to surface it. The
// backend SCOUT_ENABLED flag gates the route itself, so both must be on.
export const SCOUT_ENABLED = process.env.NEXT_PUBLIC_SCOUT_ENABLED === '1';
