import 'dotenv/config';
import { z } from 'zod';

const blankToUndefined = (v: unknown) => (v === '' ? undefined : v);
const optionalAddr = z.preprocess(blankToUndefined, z.string().startsWith('0x').optional());
const optionalString = z.preprocess(blankToUndefined, z.string().optional());

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(8787),
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error']).default('info'),

  ARC_TESTNET_RPC_URL: z.string().url().default('https://rpc.testnet.arc.network'),
  ARC_TESTNET_WSS_URL: z.string().default('wss://rpc.testnet.arc.network'),
  ARC_TESTNET_EXPLORER_URL: z.string().url().default('https://testnet.arcscan.app'),

  IDENTITY_REGISTRY_ADDR: z
    .string()
    .startsWith('0x')
    .default('0x8004A818BFB912233c491871b3d84c89A494BD9e'),
  REPUTATION_REGISTRY_ADDR: z
    .string()
    .startsWith('0x')
    .default('0x8004B663056A597Dffe9eCcC1965A193B7388713'),
  VALIDATION_REGISTRY_ADDR: z
    .string()
    .startsWith('0x')
    .default('0x8004Cb1BF31DAf7788923b405b754f57acEB4272'),
  ERC8183_REF_ADDR: z
    .string()
    .startsWith('0x')
    .default('0x0747EEf0706327138c69792bF28Cd525089e4583'),
  USDC_ADDR: z
    .string()
    .startsWith('0x')
    .default('0x3600000000000000000000000000000000000000'),

  KARWAN_JOBBOARD_ADDR: optionalAddr,
  KARWAN_ESCROW_ADDR: optionalAddr,
  KARWAN_REPUTATION_ADDR: optionalAddr,
  // Treasury that collects the platform fee. Must match the address the escrow
  // was deployed with; surfaced here for display and reconciliation.
  KARWAN_TREASURY_ADDR: optionalAddr,
  // Direct-deal review window in milliseconds. Used for two timers: the buyer
  // has this long to release the first milestone after the seller delivers, and
  // again to release the final milestone. When it expires the agent
  // auto-releases. Default 5 min for demos; raise to hours for mainnet.
  DEAL_REVIEW_WINDOW_MS: z.coerce.number().int().positive().default(300_000),
  // Each "still reviewing" tip adds this much time to the final-release window.
  // Default 10 min for demos.
  DEAL_REVIEW_EXTENSION_MS: z.coerce.number().int().positive().default(600_000),
  // Most times the buyer can extend the final-release window.
  DEAL_MAX_REVIEW_EXTENSIONS: z.coerce.number().int().positive().default(3),

  CIRCLE_API_KEY: optionalString,
  CIRCLE_ENTITY_SECRET: optionalString,
  CIRCLE_WALLET_SET_ID: optionalString,

  BUYER_AGENT_WALLET_ID: optionalString,
  BUYER_AGENT_ADDRESS: optionalAddr,
  SELLER_AGENT_WALLET_ID: optionalString,
  SELLER_AGENT_ADDRESS: optionalAddr,

  OPENROUTER_API_KEY: optionalString,
  LLM_MODEL: z.string().default('google/gemini-2.5-flash-lite'),

  // CCTP V2: Arc's MessageTransmitterV2 (where receiveMessage is called to mint).
  CCTP_MESSAGE_TRANSMITTER_ADDR: z
    .string()
    .startsWith('0x')
    .default('0xE737e5cEBEEBa77EFE34D4aa090756590b1CE275'),
  // Circle's CCTP V2 attestation API. Sandbox covers all V2 testnets.
  IRIS_API_BASE: z.string().url().default('https://iris-api-sandbox.circle.com'),

  DATABASE_URL: optionalString,
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  console.error('Invalid environment configuration:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const config = parsed.data;
export type Config = typeof config;
